import pkg from "xlsx";
const { read, utils, writeFileXLSX } = pkg;

export async function readExcelFile(file: File): Promise<Record<string, any>[]> {
  const buf = await file.arrayBuffer();
  const wb = read(buf);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return utils.sheet_to_json(ws, { defval: null });
}
