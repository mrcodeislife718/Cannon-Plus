import { parseType, checkAssignable } from './systems.js';

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

function annotationIsSupported(text) {
  const parsed = parseType(text);
  if (parsed.kind === 'nullable') return annotationIsSupported(displayAnnotation(parsed.inner));
  if (parsed.kind === 'pointer') return annotationIsSupported(displayAnnotation(parsed.to));
  if (parsed.kind === 'generic-instance') return false;
  if (parsed.kind === 'named') return BUILTIN_TYPES.has(parsed.name);
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

export function transform(source) {
  const diagnostics = [];
  const typeBindings = new Map();
  const lines = source.split(/\r?\n/);
  const output = [];
  for (let index = 0; index < lines.length; index += 1) {
    const original = lines[index];
    const lineNumber = index + 1;
    let line = original;
    const functionMatch = line.match(/^(\s*)fn\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?:->\s*([^\{]+?))?\s*\{/);
    if (functionMatch) {
      const [, indent, name, paramsText, returnTypeRaw] = functionMatch;
      const loweredParams = [];
      const params = paramsText.trim() ? splitParameters(paramsText) : [];
      for (const rawParam of params) {
        const param = rawParam.trim();
        const typed = parseTypedParameter(param);
        if (typed) {
          if (!annotationIsSupported(typed.type)) diagnostics.push({ line: lineNumber, column: original.indexOf(typed.type) + 1, message: `Unknown or unsupported Cannon+ type '${typed.type}'` });
          loweredParams.push(typed.name);
        } else if (/^[A-Za-z_$][\w$]*$/.test(param)) loweredParams.push(param);
        else if (param) diagnostics.push({ line: lineNumber, column: original.indexOf(param) + 1, message: `Invalid Cannon+ parameter '${param}'` });
      }
      const returnType = returnTypeRaw?.trim();
      if (returnType && !annotationIsSupported(returnType)) diagnostics.push({ line: lineNumber, column: original.indexOf(returnType) + 1, message: `Unknown or unsupported Cannon+ return type '${returnType}'` });
      line = `${indent}fn ${name}(${loweredParams.join(', ')}) {`;
      output.push(line);
      continue;
    }
    const declaration = line.match(/^(\s*)(let|const)?\s*([A-Za-z_$][\w$]*)\s*:\s*([^=]+?)\s*=\s*(.+)$/);
    if (declaration) {
      const [, indent, keyword = '', name, typeRaw, expression] = declaration;
      const type = typeRaw.trim();
      if (!annotationIsSupported(type)) diagnostics.push({ line: lineNumber, column: original.indexOf(type) + 1, message: `Unknown or unsupported Cannon+ type '${type}'` });
      const actual = inferLiteralType(expression);
      if (annotationIsSupported(type) && !compatible(type, actual)) diagnostics.push({ line: lineNumber, column: original.indexOf(expression) + 1, message: `Type mismatch: '${name}' is ${type} but the assigned literal is ${actual}` });
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
  return { code: output.join('\n'), types: Object.fromEntries(typeBindings) };
}

export function check(source) { return transform(source); }
export * from './systems.js';
