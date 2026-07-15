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

    expect(clientTemplate).toContain('Article L441-10 du Code de commerce : des pénalités de retard sont applicables en cas de paiement tardif');
    expect(clientTemplate).toContain('Paiement sous 30 jours. Tout retard entraîne des pénalités égales à 3 fois le taux');
    // Legal notices must appear in the body before the footer section marker
    const footerStart = clientTemplate.lastIndexOf('── Footer ─');
    const penaltiesIndex = clientTemplate.lastIndexOf('Article L441-10 du Code de commerce');
    const paymentInfoIndex = clientTemplate.lastIndexOf('Informations de paiement');
    expect(penaltiesIndex).toBeGreaterThan(paymentInfoIndex);
    expect(footerStart).toBeGreaterThan(0);
    expect(penaltiesIndex).toBeLessThan(footerStart);
  });

  it('client template renders payment status in bold yellow and IBAN in full bold', () => {
    const clientTemplatePath = path.join(__dirname, 'InvoiceClientTemplate.jsx');
    const clientTemplate = fs.readFileSync(clientTemplatePath, 'utf-8');

    // Payment status must use bold gold text without yellow background
    expect(clientTemplate).toContain('font-bold text-[#D4AF37]');
    expect(clientTemplate).not.toContain('bg-[#D4AF37] px-2 py-0.5 rounded-sm');
    // IBAN must be fully bold (label + value together)
    expect(clientTemplate).toContain('font-bold font-mono');
    // IBAN label and value must be in the same element (no separate label span)
    expect(clientTemplate).toContain('IBAN : {companyIban}');
  });

  it('client template shows disposition hours for mise à disposition bookings', () => {
    const clientTemplatePath = path.join(__dirname, 'InvoiceClientTemplate.jsx');
    const clientTemplate = fs.readFileSync(clientTemplatePath, 'utf-8');

    // Template must use the shared isDispositionTransfer utility
    expect(clientTemplate).toContain('isDispositionTransfer');
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
    expect(clientTemplate).toContain('bg-black/80');
  });

  it('client template footer has ECONNECT VTC company name in bold', () => {
    const clientTemplatePath = path.join(__dirname, 'InvoiceClientTemplate.jsx');
    const clientTemplate = fs.readFileSync(clientTemplatePath, 'utf-8');

    // Footer must contain company name wrapped in bold span
    expect(clientTemplate).toContain('font-bold text-[#333333]');
  });

  it('client template footer includes VAT number and removes trust sentence', () => {
    const clientTemplatePath = path.join(__dirname, 'InvoiceClientTemplate.jsx');
    const clientTemplate = fs.readFileSync(clientTemplatePath, 'utf-8');

    expect(clientTemplate).toContain('N° TVA');
    expect(clientTemplate).toContain("- SIRET : {companySiret} - N° TVA : {companyVatNumber}");
    expect(clientTemplate).toContain("- Tél : {companyPhone} - {companyEmail} - N° VTC : {companyVtc}");
    expect(clientTemplate).not.toContain('Merci de votre confiance');
  });

  it('client template header branding keeps only the logo zone', () => {
    const clientTemplatePath = path.join(__dirname, 'InvoiceClientTemplate.jsx');
    const clientTemplate = fs.readFileSync(clientTemplatePath, 'utf-8');

    expect(clientTemplate).not.toContain('Service de Transport Privé Premium');
  });

  it('client template shows hors admin issuer block under Émetteur with partner VAT fallback', () => {
    const clientTemplatePath = path.join(__dirname, 'InvoiceClientTemplate.jsx');
    const clientTemplate = fs.readFileSync(clientTemplatePath, 'utf-8');

    expect(clientTemplate).toContain('Facture émise par ECONNECT VTC pour :');
    expect(clientTemplate).toContain('N° de TVA : {partnerCompanyVat}');
    expect(clientTemplate).toContain('booking?.issuer?.name');
    expect(clientTemplate).not.toContain('Facture émise par ECONNECT VTC au nom et pour le compte de :');
    expect(clientTemplate).not.toContain('LeCab');
  });

  it('client template payment status always uses "Statut : " prefix', () => {
    const clientTemplatePath = path.join(__dirname, 'InvoiceClientTemplate.jsx');
    const clientTemplate = fs.readFileSync(clientTemplatePath, 'utf-8');

    expect(clientTemplate).toContain('`Statut : ${paymentStatusLabel}`');
    expect(clientTemplate).not.toContain("'Statut à payer'");
  });
});
