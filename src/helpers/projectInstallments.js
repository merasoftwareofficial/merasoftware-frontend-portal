// Keep paise allocation aligned with backend/helpers/projectInstallments.js.
export const buildInstallmentPreview = (totalAmount, installmentCount) => {
  const splits = Number(installmentCount) === 3 ? [30, 30, 40] : [50, 50];
  const totalPaise = Math.round(Number(totalAmount) * 100);
  let allocated = 0;
  return splits.map((percentage, index) => {
    const paise = index === splits.length - 1 ? totalPaise - allocated : Math.round(totalPaise * percentage / 100);
    allocated += paise;
    return { installmentNumber: index + 1, percentage, amount: paise / 100 };
  });
};

// Keep aligned with backend/helpers/projectInstallments.js buildCycleInstallments: a monthly package
// project pays one same-amount installment per billing cycle, due on its date (merasoftware/src/docs/package.md).
const addMonths = (date, months) => { const result = new Date(date); result.setMonth(result.getMonth() + Number(months || 0)); return result; };
export const buildCycleInstallmentPreview = (cyclePrice, totalCycles, cycleMonths, start = new Date()) => {
  let allocated = 0;
  return Array.from({ length: Number(totalCycles) }, (_, index) => {
    const percentage = index === totalCycles - 1 ? Math.round((100 - allocated) * 100) / 100 : Math.round(10000 / totalCycles) / 100;
    allocated += percentage;
    return { installmentNumber: index + 1, percentage, amount: Number(cyclePrice), dueBy: 'date', dueDate: addMonths(start, index * cycleMonths) };
  });
};

const dateText = (value) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
// An installment's name and purpose come from the installment itself, never from its number:
// projects are split 50 / 50 or 30 / 30 / 40 (merasoftware/src/docs/package.md §5 item 17).
const percentText = (value) => `${Math.round(Number(value) * 100) / 100}%`;
export const installmentName = (installment, count) => {
  const number = Number(installment?.installmentNumber);
  if (!Number.isFinite(number)) return 'Installment';
  // A monthly package cycle: "Cycle 3 of 4 · due 8 Feb 2027".
  if (installment?.dueBy === 'date') return `Cycle ${number}${count ? ` of ${count}` : ''}${installment.dueDate ? ` · due ${dateText(installment.dueDate)}` : ''}`;
  return `Installment ${number}${count ? ` of ${count}` : ''}${installment?.percentage ? ` (${percentText(installment.percentage)})` : ''}`;
};
export const installmentPurpose = (installment, count) => {
  const number = Number(installment?.installmentNumber);
  if (installment?.dueBy === 'date') return number === 1 ? 'This payment starts your package.' : 'This payment keeps your package running for its next billing cycle.';
  if (number === 1) return 'This payment starts your project.';
  if (count && number === Number(count)) return 'This payment completes the payment for your project.';
  if (installment?.progressThreshold != null) return `This payment lets your project continue past ${percentText(installment.progressThreshold)}.`;
  return 'This payment keeps your project moving.';
};
