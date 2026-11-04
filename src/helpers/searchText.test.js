import { matchesSearch, searchDigits } from "./searchText";

const lead = { texts: ["Ravi Kumar", "Ravi Traders", "ravi@example.test"], phones: ["98765 43210", "+91 91234-56789"] };

test("text fields match ignoring case", () => {
  expect(matchesSearch("traders", lead)).toBe(true);
  expect(matchesSearch("kumar", lead)).toBe(true);
  expect(matchesSearch("sharma", lead)).toBe(false);
});

test("phones match whatever spaces, dashes or Indian code are typed or saved", () => {
  for (const query of ["9876543210", "98765 43210", "98765-43210", "+91 98765 43210", "919876543210", "09876543210", "0091 98765 43210", "98765", "9123456789"]) {
    expect(matchesSearch(query, lead)).toBe(true);
  }
  expect(matchesSearch("11111", lead)).toBe(false);
});

test("the Indian code is dropped only when it is a code", () => {
  expect(searchDigits("+91 98765")).toBe("98765");
  expect(searchDigits("919876543210")).toBe("9876543210");
  expect(searchDigits("09876543210")).toBe("9876543210");
  expect(searchDigits("9198")).toBe("9198");
  expect(searchDigits("+1 415 555 0100")).toBe("14155550100");
});
