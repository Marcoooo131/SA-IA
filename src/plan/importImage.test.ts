import { describe, expect, it } from 'vitest';
import { importPlanFile, isAcceptedPlanFile } from './importImage';

describe("import d'un plan ou d'une photo", () => {
  it('accepte PNG, JPG/JPEG et PDF', () => {
    expect(isAcceptedPlanFile(new File(['x'], 'plan.png', { type: 'image/png' }))).toBe(true);
    expect(isAcceptedPlanFile(new File(['x'], 'photo.JPG', { type: '' }))).toBe(true);
    expect(isAcceptedPlanFile(new File(['x'], 'scan.jpeg', { type: 'image/jpeg' }))).toBe(true);
    expect(isAcceptedPlanFile(new File(['x'], 'plan.pdf', { type: 'application/pdf' }))).toBe(true);
  });

  it('refuse les formats non pris en charge avec un message clair', async () => {
    await expect(importPlanFile(new File(['x'], 'plan.gif', { type: 'image/gif' }))).rejects.toThrow(/Format non pris en charge/);
    await expect(importPlanFile(new File(['x'], 'plan.dwg', { type: '' }))).rejects.toThrow(/PNG, JPG\/JPEG ou PDF/);
  });

  it('refuse un fichier trop volumineux', async () => {
    const big = new File([new Uint8Array(26 * 1024 * 1024)], 'enorme.png', { type: 'image/png' });
    await expect(importPlanFile(big)).rejects.toThrow(/trop volumineux/);
  });
});
