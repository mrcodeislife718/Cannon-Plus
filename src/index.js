import { parseType, checkAssignable, TypeRegistry } from './systems.js';

const BUILTIN_TYPES = new Set(['string','bool','i8','i16','i32','i64','u8','u16','u32','u64','f32','f64','number','void']);

export class CannonPlusError extends Error {
  constructor(message, line = null, column = null) {
    super(message);
    this.name = 'CannonPlusError';
    this.line = line;
    this.column = column;
  }
}

function inferLiteralType(text) {
  const value = text.trim();
  if (value === 'null') return 'null';
  if (/^[-+]?\d+$/.test(value)) return 'i32';
  if (/^[-+]?(?:\d+\.\d*|\d*\.\d+)$/.test(value)) return 'f64';
  if (/^(true|false)$/.test(value)) return 'bool';
  if (/^(['"]).*\1$/s.test(value)) return 'string';
  return null;
}

function annotationIsSupported(text, registry, typeParameters = new Set()) {
  const parsed = typeof text === 'string' ? parseType(text) : text;
  if (parsed.kind === 'nullable') return annotationIsSupported(parsed.inner, registry, typeParameters);
  if (parsed.kind === 'pointer') return annotationIsSupported(parsed.to, registry, typeParameters);
  if (parsed.kind === 'generic-instance') {
    const definition = registry.get(parsed.name);
    if (!definition || definition.kind !== 'struct' || definition.generics.length !== parsed.args.length) return false;
    return parsed.args.every((arg) => annotationIsSupported(arg, registry, typeParameters));
  }
  if (parsed.kind === 'named') return BUILTIN_TYPES.has(parsed.name) || typeParameters.has(parsed.name) || Boolean(registry.get(parsed.name));
  return Boolean(parsed.name ? BUILTIN_TYPES.has(parsed.name) : parsed.kind);
}

function displayAnnotation(type) {
  if (!type) return 'unknown';
  if (type.kind === 'nullable') return `${displayAnnotation(type.inner)}?`;
  if (type.kind === 'pointer') return `*${type.mutable ? 'mut' : 'const'} ${displayAnnotation(type.to)}`;
  if (type.kind === 'generic-instance') return `${type.name}<${type.args.map(displayAnnotation).join(', ')}>`;
  return type.name ?? type.kind;
}

function compatible(expected, actual) {
  if (!actual) return true;
  const expectedType = parseType(expected);
  if (actual === 'null') return expectedType.kind === 'nullable';
  if (expected === 'number' && ['i8','i16','i32','i64','u8','u16','u32','u64','f32','f64'].includes(actual)) return true;
  return checkAssignable(actual, expected).ok;
}

function splitParameters(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '<') depth += 1;
    else if (char === '>') depth -= 1;
    else if (char === ',' && depth === 0) {
      out.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

function parseTypedParameter(param) {
  const separator = param.indexOf(':');
  if (separator < 0) return null;
  const name = param.slice(0, separator).trim();
  const type = param.slice(separator + 1).trim();
  if (!/^[A-Za-z_$][\w$]*$/.test(name) || !type) return null;
  return { name, type };
}

function parseTypeDefinitions(lines, diagnostics) {
  const registry = new TypeRegistry();
  const consumed = new Set();
  const definitions = {};

  for (let index = 0; index < lines.length; index += 1) {
    const original = lines[index];
    const trimmed = original.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    const alias = trimmed.match(/^type\s+([A-Za-z_$][\w$]*)\s*=\s*(.+?)\s*;?$/);
    if (alias) {
      const [, name, target] = alias;
      try {
        if (!annotationIsSupported(target, registry)) throw new Error(`Unknown Cannon+ type '${target}'`);
        definitions[name] = registry.defineAlias(name, target);
        consumed.add(index);
      } catch (error) {
        diagnostics.push({ line: index + 1, column: original.indexOf(name) + 1, message: error.message });
      }
      continue;
    }

    const header = trimmed.match(/^struct\s+([A-Za-z_$][\w$]*)(?:<([^>]+)>)?\s*\{\s*(.*)$/);
    if (!header) continue;
    const [, name, genericText = '', remainder] = header;
    const generics = genericText ? splitParameters(genericText).map((entry) => entry.trim()) : [];
    if (generics.some((entry) => !/^[A-Za-z_$][\w$]*$/.test(entry)) || new Set(generics).size !== generics.length) {
      diagnostics.push({ line: index + 1, column: original.indexOf(name) + 1, message: `Invalid generic parameter list for struct '${name}'` });
      continue;
    }
    const typeParameters = new Set(generics);
    const bodyParts = [];
    let cursor = index;
    let tail = remainder;
    let closed = false;
    while (true) {
      const close = tail.indexOf('}');
      if (close >= 0) {
        bodyParts.push(tail.slice(0, close));
        closed = true;
        break;
      }
      bodyParts.push(tail);
      cursor += 1;
      if (cursor >= lines.length) break;
      tail = lines[cursor];
    }
    if (!closed) {
      diagnostics.push({ line: index + 1, column: original.indexOf('struct') + 1, message: `Unterminated struct '${name}'` });
      continue;
    }

    const fields = {};
    const fieldText = bodyParts.join('\n');
    for (const rawField of fieldText.split(/[;,\n]/)) {
      const field = rawField.trim();
      if (!field) continue;
      const separator = field.indexOf(':');
      if (separator < 1) {
        diagnostics.push({ line: index + 1, column: 1, message: `Invalid field '${field}' in struct '${name}'` });
        continue;
      }
      const fieldName = field.slice(0, separator).trim();
      const fieldType = field.slice(separator + 1).trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(fieldName) || !annotationIsSupported(fieldType, registry, typeParameters)) {
        diagnostics.push({ line: index + 1, column: 1, message: `Invalid field '${field}' in struct '${name}'` });
        continue;
      }
      if (Object.hasOwn(fields, fieldName)) diagnostics.push({ line: index + 1, column: 1, message: `Duplicate field '${fieldName}' in struct '${name}'` });
      else fields[fieldName] = fieldType;
    }
    try {
      definitions[name] = registry.defineStruct(name, fields, { generics });
      for (let line = index; line <= cursor; line += 1) consumed.add(line);
      index = cursor;
    } catch (error) {
      diagnostics.push({ line: index + 1, column: original.indexOf(name) + 1, message: error.message });
    }
  }
  return { registry, consumed, definitions };
}

export function transform(source) {
  const diagnostics = [];
  const typeBindings = new Map();
  const lines = source.split(/\r?\n/);
  const { registry, consumed, definitions } = parseTypeDefinitions(lines, diagnostics);
  const output = [];

  for (let index = 0; index < lines.length; index += 1) {
    const original = lines[index];
    if (consumed.has(index)) { output.push(''); continue; }
    const lineNumber = index + 1;
    let line = original;
    const functionMatch = line.match(/^(\s*)(async\s+)?fn\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?:->\s*([^\{]+?))?\s*\{/);
    if (functionMatch) {
      const [, indent, asyncPrefix = '', name, paramsText, returnTypeRaw] = functionMatch;
      const loweredParams = [];
      const params = paramsText.trim() ? splitParameters(paramsText) : [];
      for (const rawParam of params) {
        const param = rawParam.trim();
        const typed = parseTypedParameter(param);
        if (typed) {
          if (!annotationIsSupported(typed.type, registry)) diagnostics.push({ line: lineNumber, column: original.indexOf(typed.type) + 1, message: `Unknown Cannon+ type '${typed.type}'` });
          loweredParams.push(typed.name);
        } else if (/^[A-Za-z_$][\w$]*$/.test(param)) loweredParams.push(param);
        else if (param) diagnostics.push({ line: lineNumber, column: original.indexOf(param) + 1, message: `Invalid Cannon+ parameter '${param}'` });
      }
      const returnType = returnTypeRaw?.trim();
      if (returnType && !annotationIsSupported(returnType, registry)) diagnostics.push({ line: lineNumber, column: original.indexOf(returnType) + 1, message: `Unknown Cannon+ return type '${returnType}'` });
      line = `${indent}${asyncPrefix}fn ${name}(${loweredParams.join(', ')}) {`;
      output.push(line);
      continue;
    }
    const declaration = line.match(/^(\s*)(let|const)?\s*([A-Za-z_$][\w$]*)\s*:\s*([^=]+?)\s*=\s*(.+)$/);
    if (declaration) {
      const [, indent, keyword = '', name, typeRaw, expression] = declaration;
      const type = typeRaw.trim();
      if (!annotationIsSupported(type, registry)) diagnostics.push({ line: lineNumber, column: original.indexOf(type) + 1, message: `Unknown Cannon+ type '${type}'` });
      const actual = inferLiteralType(expression);
      if (annotationIsSupported(type, registry) && !compatible(type, actual)) diagnostics.push({ line: lineNumber, column: original.indexOf(expression) + 1, message: `Type mismatch: '${name}' is ${type} but the assigned literal is ${actual}` });
      typeBindings.set(name, type);
      line = `${indent}${keyword ? `${keyword} ` : ''}${name} = ${expression}`;
      output.push(line);
      continue;
    }
    const assignment = line.match(/^(\s*)([A-Za-z_$][\w$]*)\s*=\s*(.+)$/);
    if (assignment) {
      const [, , name, expression] = assignment;
      if (typeBindings.has(name)) {
        const actual = inferLiteralType(expression);
        const expected = typeBindings.get(name);
        if (!compatible(expected, actual)) diagnostics.push({ line: lineNumber, column: original.indexOf(expression) + 1, message: `Type mismatch: '${name}' is ${expected} but the assigned literal is ${actual}` });
      }
    }
    output.push(line);
  }
  if (diagnostics.length) {
    const first = diagnostics[0];
    const error = new CannonPlusError(first.message, first.line, first.column);
    error.diagnostics = diagnostics;
    throw error;
  }
  return { code: output.join('\n'), types: Object.fromEntries(typeBindings), definitions };
}

export function check(source) { return transform(source); }
export * from './systems.js';
