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
  if (/^[-+]?\d+$/.test(value)) return 'i32';
  if (/^[-+]?(?:\d+\.\d*|\d*\.\d+)$/.test(value)) return 'f64';
  if (/^(true|false)$/.test(value)) return 'bool';
  if (/^(['"]).*\1$/s.test(value)) return 'string';
  return null;
}

function compatible(expected, actual) {
  if (!actual) return true;
  if (expected === actual) return true;
  if (expected === 'number' && ['i8','i16','i32','i64','u8','u16','u32','u64','f32','f64'].includes(actual)) return true;
  if (['i64','f32','f64'].includes(expected) && actual === 'i32') return true;
  if (expected === 'f64' && actual === 'f32') return true;
  return false;
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
    const functionMatch = line.match(/^(\s*)fn\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?:->\s*([A-Za-z_$][\w$]*))?\s*\{/);
    if (functionMatch) {
      const [, indent, name, paramsText, returnType] = functionMatch;
      const loweredParams = [];
      const params = paramsText.trim() ? paramsText.split(',') : [];
      for (const rawParam of params) {
        const param = rawParam.trim();
        const typed = param.match(/^([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)$/);
        if (typed) {
          const [, paramName, type] = typed;
          if (!BUILTIN_TYPES.has(type)) diagnostics.push({ line: lineNumber, column: original.indexOf(type) + 1, message: `Unknown Cannon+ type '${type}'` });
          loweredParams.push(paramName);
        } else if (/^[A-Za-z_$][\w$]*$/.test(param)) loweredParams.push(param);
        else if (param) diagnostics.push({ line: lineNumber, column: original.indexOf(param) + 1, message: `Invalid Cannon+ parameter '${param}'` });
      }
      if (returnType && !BUILTIN_TYPES.has(returnType)) diagnostics.push({ line: lineNumber, column: original.indexOf(returnType) + 1, message: `Unknown Cannon+ return type '${returnType}'` });
      line = `${indent}fn ${name}(${loweredParams.join(', ')}) {`;
      output.push(line);
      continue;
    }
    const declaration = line.match(/^(\s*)(let|const)?\s*([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)\s*=\s*(.+)$/);
    if (declaration) {
      const [, indent, keyword = '', name, type, expression] = declaration;
      if (!BUILTIN_TYPES.has(type)) diagnostics.push({ line: lineNumber, column: original.indexOf(type) + 1, message: `Unknown Cannon+ type '${type}'` });
      const actual = inferLiteralType(expression);
      if (!compatible(type, actual)) diagnostics.push({ line: lineNumber, column: original.indexOf(expression) + 1, message: `Type mismatch: '${name}' is ${type} but the assigned literal is ${actual}` });
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
