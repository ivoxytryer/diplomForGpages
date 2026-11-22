export type CellValue = string | number | null | undefined;

export interface ExcelSheet {
  name: string;
  rows: CellValue[][];
}

function normalize(rows: CellValue[][]) {
  return rows.map((row) => row.map((cell) => (cell === null || cell === undefined ? '' : cell)));
}

export async function exportExcel(filename: string, sheets: ExcelSheet[]) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();

  sheets.forEach((sheet) => {
    const rows = normalize(sheet.rows);
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const widths = rows.reduce<number[]>((acc, row) => {
      row.forEach((cell, index) => {
        const length = String(cell).length + 2;
        acc[index] = Math.max(acc[index] ?? 10, Math.min(length, 52));
      });
      return acc;
    }, []);
    worksheet['!cols'] = widths.map((width) => ({ wch: width }));
    const safeName = sheet.name.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Лист';
    XLSX.utils.book_append_sheet(workbook, worksheet, safeName);
  });

  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export function printDocument() {
  window.print();
}

export function todayStamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}
