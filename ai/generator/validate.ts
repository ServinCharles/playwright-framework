export interface Validation {
  ok: boolean;
  problems: string[];
}

/**
 * Cheap static checks that every AI-generated spec must pass BEFORE a human reviews it.
 * They catch the usual weak spots: no assertions, fixed waits, hardcoded secrets or URLs.
 * Passing these checks does not make a test good. A person still has to review it.
 */
export function validateGenerated(code: string): Validation {
  const problems: string[] = [];

  if (code.includes('```')) problems.push('contains markdown code fences');
  if (!/\btest\s*(\.describe)?\s*\(/.test(code)) problems.push('has no test() or test.describe()');

  const tests = (code.match(/\btest\s*\(/g) ?? []).length;
  const expects = (code.match(/\bexpect\s*[(.]/g) ?? []).length;
  if (expects === 0) problems.push('has no expect() assertions');
  else if (expects < tests) problems.push(`has ${tests} tests but only ${expects} assertions`);

  if (!/from\s+['"](\.\.\/)+fixtures['"]/.test(code)) {
    problems.push("does not import test/expect from the framework fixtures ('../../fixtures')");
  }
  if (/waitForTimeout\s*\(/.test(code)) problems.push('uses waitForTimeout (fixed wait)');
  if (/\.only\s*\(/.test(code)) problems.push('uses test.only');
  if (/page\.pause\s*\(/.test(code)) problems.push('uses page.pause');
  if (/https?:\/\/[^\s'"`]+/.test(code)) problems.push('hardcodes a URL (use baseURL or env)');
  if (/\b(password|passwd|secret|api[_-]?key|token)\b\s*[:=]\s*['"][^'"]+['"]/i.test(code)) {
    problems.push('hardcodes a credential (use data/users.json or env)');
  }

  return { ok: problems.length === 0, problems };
}

/** Models often wrap code in ``` fences. Remove them so the file is plain TypeScript. */
export function stripFences(text: string): string {
  const match = text.match(/```(?:typescript|ts)?\s*\n([\s\S]*?)```/);
  return (match ? match[1] : text).trim() + '\n';
}
