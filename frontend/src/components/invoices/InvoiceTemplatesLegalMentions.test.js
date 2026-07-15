import fs from 'fs';
import path from 'path';

describe('Invoice templates legal TVA mentions', () => {
  it('removes legal TVA footer mentions while keeping accounting TVA rows', () => {
    const clientTemplatePath = path.join(__dirname, 'InvoiceClientTemplate.jsx');
    const commissionTemplatePath = path.join(__dirname, 'InvoiceCommissionTemplate.jsx');
    const driverTemplatePath = path.join(__dirname, 'InvoiceDriverTemplate.jsx');

    const clientTemplate = fs.readFileSync(clientTemplatePath, 'utf-8');
    const commissionTemplate = fs.readFileSync(commissionTemplatePath, 'utf-8');
    const driverTemplate = fs.readFileSync(driverTemplatePath, 'utf-8');
    const combined = `${clientTemplate}\n${commissionTemplate}\n${driverTemplate}`;

    expect(combined).not.toContain('TVA non récupérable par le preneur');
    expect(combined).not.toContain('TVA sur commission à reverser au Trésor public');
    expect(clientTemplate).toContain('Montant TVA');
    expect(commissionTemplate).toContain('TVA (');
    expect(driverTemplate).not.toContain('TVA non récupérable');
  });

  it('client template has penalties notice in invoice body (not only in footer)', () => {
    const clientTemplatePath = path.join(__dirname, 'InvoiceClientTemplate.jsx');
    const clientTemplate = fs.readFileSync(clientTemplatePath, 'utf-8');

    // Penalties section must exist in the template body
    expect(clientTemplate).toContain('Tout retard entraîne des pénalités');
    // Penalties must NOT appear inside the footer div (last section of the template)
    // The footer section starts after the Payment info section
    const footerStart = clientTemplate.lastIndexOf('Footer');
    const penaltiesIndex = clientTemplate.lastIndexOf('Tout retard entraîne des pénalités');
    expect(penaltiesIndex).toBeGreaterThan(0);
    expect(penaltiesIndex).toBeLessThan(footerStart);
  });

  it('client template renders payment status in bold yellow and IBAN in full bold', () => {
    const clientTemplatePath = path.join(__dirname, 'InvoiceClientTemplate.jsx');
    const clientTemplate = fs.readFileSync(clientTemplatePath, 'utf-8');

    // Payment status must use bold yellow classes (consistent with TOTAL TTC)
    expect(clientTemplate).toContain('font-bold text-[#D4AF37]');
    // IBAN must be fully bold (label + value together)
    expect(clientTemplate).toContain('font-bold font-mono');
    // IBAN label and value must be in the same element (no separate label span)
    expect(clientTemplate).toContain('IBAN : {companyIban}');
  });

  it('client template shows disposition hours for mise à disposition bookings', () => {
    const clientTemplatePath = path.join(__dirname, 'InvoiceClientTemplate.jsx');
    const clientTemplate = fs.readFileSync(clientTemplatePath, 'utf-8');

    // Template must contain disposition detection logic
    expect(clientTemplate).toContain('isDispositionOrder');
    expect(clientTemplate).toContain('dispositionHours');
    // Template must render hours when available
    expect(clientTemplate).toContain('Durée : {dispositionHours}h');
  });

  it('client template FACTURE box uses light border (not heavy dark border)', () => {
    const clientTemplatePath = path.join(__dirname, 'InvoiceClientTemplate.jsx');
    const clientTemplate = fs.readFileSync(clientTemplatePath, 'utf-8');

    // Should use a light border class, not border-2 with dark color
    expect(clientTemplate).not.toContain('border-2 border-[#111111]');
    expect(clientTemplate).toContain('border border-[#CCCCCC]');
  });

  it('client template section headers use a lighter dark background', () => {
    const clientTemplatePath = path.join(__dirname, 'InvoiceClientTemplate.jsx');
    const clientTemplate = fs.readFileSync(clientTemplatePath, 'utf-8');

    // Section headers (Émetteur, Client, table header) should use lighter shade
    expect(clientTemplate).not.toContain('bg-[#1A1A1A]');
    expect(clientTemplate).toContain('bg-[#2A2A2A]');
  });

  it('client template footer has ECONNECT VTC company name in bold', () => {
    const clientTemplatePath = path.join(__dirname, 'InvoiceClientTemplate.jsx');
    const clientTemplate = fs.readFileSync(clientTemplatePath, 'utf-8');

    // Footer must contain company name wrapped in bold span
    expect(clientTemplate).toContain('font-bold text-[#333333]');
  });
});
