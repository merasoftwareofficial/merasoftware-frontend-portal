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
