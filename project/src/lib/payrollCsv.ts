export type PayrollRecipientMatch = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export function parsePayrollCsv(text: string): string[][] {
  if (typeof text !== 'string' || text.length > 2_000_000) {
    throw new Error('CSV must be 2 MB or smaller.');
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error('CSV contains an unclosed quotation mark.');
  row.push(cell.trim());
  if (row.some(value => value !== '')) rows.push(row);
  if (rows.length < 2) throw new Error('The CSV needs a header and at least one payroll row.');
  return rows;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string) {
  return value.replace(/[^0-9]/g, '');
}

function validAmount(value: string) {
  const amount = value.trim().replace(/\s/g, '').replace(/^SLE/i, '');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(amount)) {
    throw new Error('Enter a positive SLE amount with up to two decimal places.');
  }
  const [whole, fraction = ''] = amount.split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (minor < 1n || minor > 1_000_000_000_000n) throw new Error('Amount is outside the permitted range.');
  return amount;
}

export function matchPayrollCsv(csvText: string, recipients: PayrollRecipientMatch[]) {
  const rows = parsePayrollCsv(csvText);
  if (rows.length - 1 > 500) throw new Error('A single payroll import can contain at most 500 staff.');
  const headers = rows[0].map(value => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
  const emailIndex = headers.findIndex(value => ['email', 'employee email', 'staff email', 'work email'].includes(value));
  const phoneIndex = headers.findIndex(value => ['phone', 'phone number', 'mobile', 'mobile number'].includes(value));
  const nameIndex = headers.findIndex(value => ['name', 'full name', 'employee name', 'staff name'].includes(value));
  const amountIndex = headers.findIndex(value => ['amount', 'salary', 'monthly salary', 'net pay', 'pay amount'].includes(value));

  if (amountIndex < 0 || (emailIndex < 0 && phoneIndex < 0 && nameIndex < 0)) {
    throw new Error('Required columns: Email or Phone or Full Name, plus Amount/Salary.');
  }

  const amounts: Record<string, string> = {};
  const used = new Set<string>();
  for (let index = 1; index < rows.length; index += 1) {
    const values = rows[index];
    const email = emailIndex >= 0 ? normalizeEmail(values[emailIndex] || '') : '';
    const phone = phoneIndex >= 0 ? normalizePhone(values[phoneIndex] || '') : '';
    const name = nameIndex >= 0 ? normalizeEmail(values[nameIndex] || '') : '';
    const amount = validAmount(values[amountIndex] || '');

    let matches = recipients.filter(person => email && normalizeEmail(person.email || '') === email);
    if (!matches.length && phone) matches = recipients.filter(person => phone && normalizePhone(person.phone || '') === phone);
    if (!matches.length && name) matches = recipients.filter(person => name && normalizeEmail(person.full_name || '') === name);

    if (matches.length !== 1) {
      throw new Error(`CSV row ${index + 1}: employee could not be matched uniquely. Check email, phone or full name.`);
    }
    const recipient = matches[0];
    if (used.has(recipient.id)) throw new Error(`CSV row ${index + 1}: duplicate employee entry.`);
    used.add(recipient.id);
    amounts[recipient.id] = amount;
  }

  return amounts;
}
