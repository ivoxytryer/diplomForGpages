export type CellValue = string | number | null | undefined;

export interface ExcelSheet {
  name: string;
  rows: CellValue[][];
}

function normalize(rows: CellValue[][]) {
  return rows.map((row) => row.map((cell) => (cell === null || cell === undefined ? '' : cell)));
}

function columnWidths(rows: CellValue[][]) {
  return rows.reduce<number[]>((acc, row) => {
    row.forEach((cell, index) => {
      const length = String(cell).length + 2;
      acc[index] = Math.max(acc[index] ?? 10, Math.min(length, 52));
    });
    return acc;
  }, []);
}

export async function exportExcel(filename: string, sheets: ExcelSheet[]) {
  // write-excel-file собирает .xlsx в браузере без Node-полифилов и без
  // уязвимого xlsx@0.18. Динамический импорт держит библиотеку вне initial bundle.
  const { default: writeXlsxFile } = await import('write-excel-file/browser');

  const data = sheets.map((sheet) => {
    const rows = normalize(sheet.rows);
    return {
      data: rows,
      sheet: sheet.name.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Лист',
      columns: columnWidths(rows).map((width) => ({ width })),
      stickyRowsCount: 1,
    };
  });

  await writeXlsxFile(data).toFile(
    filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`,
  );
}

export function printDocument() {
  window.print();
}

export function todayStamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}
