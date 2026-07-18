import fs from 'fs';
import path from 'path';

describe('ActivityStatementTemplate', () => {
  const activityTemplatePath = path.join(__dirname, 'ActivityStatementTemplate.jsx');
  let activityTemplate;

  beforeAll(() => {
    activityTemplate = fs.readFileSync(activityTemplatePath, 'utf-8');
  });

  it('exists as a file alongside the other invoice templates', () => {
    expect(fs.existsSync(activityTemplatePath)).toBe(true);
  });

  it('uses the same light design as the commission template (white bg, black section headers)', () => {
    expect(activityTemplate).toContain('bg-white');
    expect(activityTemplate).toContain('bg-black/80');
  });

  it('has a header with logo and Relevé d\'activité label', () => {
    expect(activityTemplate).toContain('/photo/logo-invoice-hd.png');
    expect(activityTemplate).toContain("Relevé d'activité N°");
  });

  it('shows SOCIETE EMETTRICE and SOCIETE PARTENAIRE sections', () => {
    expect(activityTemplate).toContain('SOCIETE EMETTRICE');
    expect(activityTemplate).toContain('SOCIETE PARTENAIRE');
  });

  it('shows partner company fields (name, address, siret, vat, driver)', () => {
    expect(activityTemplate).toContain('partnerCompanyName');
    expect(activityTemplate).toContain('partnerCompanyAddress');
    expect(activityTemplate).toContain('partnerCompanyVat');
    expect(activityTemplate).toContain('Chauffeur : {partnerDriverName}');
  });

  it('has an activity table with correct column headers', () => {
    expect(activityTemplate).toContain('Date');
    expect(activityTemplate).toContain('Description');
    expect(activityTemplate).toContain('Course TTC');
    expect(activityTemplate).toContain('Commission TTC');
    expect(activityTemplate).toContain('Versé HT');
  });

  it('shows a totals block with gold total row', () => {
    expect(activityTemplate).toContain('bg-[#D4AF37]');
    expect(activityTemplate).toContain('Total activité HT');
    expect(activityTemplate).toContain('driverEarning');
  });

  it('shows commission rate and a commission breakdown line', () => {
    expect(activityTemplate).toContain('commissionRate');
    expect(activityTemplate).toContain('Commission prélevée TTC');
    expect(activityTemplate).toContain('commissionTtc');
  });

  it('has a footer with company details and VTC number', () => {
    expect(activityTemplate).toContain('SIRET : {companySiret} - N° TVA : {companyVatNumber}');
    expect(activityTemplate).toContain('N° VTC : {companyVtc}');
    expect(activityTemplate).toContain('font-bold text-[#333333]');
  });

  it('uses shared invoiceUtils helpers', () => {
    expect(activityTemplate).toContain('formatCurrency');
    expect(activityTemplate).toContain('formatDate');
    expect(activityTemplate).toContain('formatInvoiceNumber');
    expect(activityTemplate).toContain('isDispositionTransfer');
  });

  it('does not import LogoDisplay (uses img tag like commission template)', () => {
    expect(activityTemplate).not.toContain('LogoDisplay');
  });

  it('uses a light border for the document number box (matching commission template)', () => {
    expect(activityTemplate).toContain('border border-[#CCCCCC]');
  });
});

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

    expect(clientTemplate).toContain('Article L441-10 du Code de commerce : des pénalités de retard sont applicables en cas de paiement tardif.');
    expect(clientTemplate).toContain('Paiement sous 30 jours. Tout retard entraîne des pénalités égales à 3 fois le taux ECONNECT.');
    expect(clientTemplate).not.toContain('<ul');
    expect(clientTemplate).not.toContain('<li');
    // Legal notices must appear in the body before the footer section marker
    const footerStart = clientTemplate.lastIndexOf('── Footer ─');
    const penaltiesIndex = clientTemplate.lastIndexOf('Article L441-10 du Code de commerce');
    const paymentInfoIndex = clientTemplate.lastIndexOf('Informations de paiement');
    expect(penaltiesIndex).toBeGreaterThan(paymentInfoIndex);
    expect(footerStart).toBeGreaterThan(0);
    expect(penaltiesIndex).toBeLessThan(footerStart);
  });

  it('client template renders payment status in bold yellow and IBAN only for bank transfer with real value', () => {
    const clientTemplatePath = path.join(__dirname, 'InvoiceClientTemplate.jsx');
    const clientTemplate = fs.readFileSync(clientTemplatePath, 'utf-8');

    // Payment status must use bold gold text without yellow background
    expect(clientTemplate).toContain('font-bold text-[#D4AF37]');
    expect(clientTemplate).not.toContain('bg-[#D4AF37] px-2 py-0.5 rounded-sm');
    expect(clientTemplate).toContain('normalizePaymentMethod');
    expect(clientTemplate).toContain("normalizedPaymentMethod === 'virement'");
    expect(clientTemplate).toContain('shouldShowIban');
    expect(clientTemplate).toContain('IBAN_PLACEHOLDER_VALUES');
    expect(clientTemplate).toContain("IBAN_PLACEHOLDER_VALUES.has(String(companyIban || '').trim())");
    // IBAN must be fully bold (label + value together) when displayed
    expect(clientTemplate).toContain('font-bold font-mono');
    // Never hardcode placeholder IBAN values
    expect(clientTemplate).not.toContain('IBAN : N/A');
    expect(clientTemplate).not.toContain('IBAN : À compléter');
    expect(clientTemplate).not.toContain("includes('virement') || companyIban !== 'À compléter'");
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
    expect(clientTemplate).toContain('Chauffeur : {partnerDriverName}');
    expect(clientTemplate).toContain('Numéro de Téléphone : {partnerPhoneNumber}');
    expect(clientTemplate).toContain('Numéro de TVA : {partnerCompanyVat}');
    const introIndex = clientTemplate.indexOf('Facture émise par ECONNECT VTC pour :');
    const companyNameIndex = clientTemplate.indexOf('{partnerCompanyName}');
    const driverIndex = clientTemplate.indexOf('Chauffeur : {partnerDriverName}');
    const phoneIndex = clientTemplate.indexOf('Numéro de Téléphone : {partnerPhoneNumber}');
    const vatIndex = clientTemplate.indexOf('Numéro de TVA : {partnerCompanyVat}');
    expect(introIndex).toBeLessThan(companyNameIndex);
    expect(companyNameIndex).toBeLessThan(driverIndex);
    expect(driverIndex).toBeLessThan(phoneIndex);
    expect(phoneIndex).toBeLessThan(vatIndex);
    expect(clientTemplate).toContain('booking?.issuer?.name');
    expect(clientTemplate).not.toContain('Facture émise par ECONNECT VTC au nom et pour le compte de :');
    expect(clientTemplate).not.toContain('LeCab');
  });

  it('client template service description uses "Courses effectuées" wording', () => {
    const clientTemplatePath = path.join(__dirname, 'InvoiceClientTemplate.jsx');
    const clientTemplate = fs.readFileSync(clientTemplatePath, 'utf-8');

    expect(clientTemplate).toContain('Courses effectuées');
    expect(clientTemplate).not.toContain('Course VTC');
  });

  it('client template payment status always uses "Statut : " prefix', () => {
    const clientTemplatePath = path.join(__dirname, 'InvoiceClientTemplate.jsx');
    const clientTemplate = fs.readFileSync(clientTemplatePath, 'utf-8');

    expect(clientTemplate).toContain('`Statut : ${paymentStatusLabel}`');
    expect(clientTemplate).not.toContain("'Statut à payer'");
  });

  it('commission template reuses client-style layout and partner company fields', () => {
    const commissionTemplatePath = path.join(__dirname, 'InvoiceCommissionTemplate.jsx');
    const commissionTemplate = fs.readFileSync(commissionTemplatePath, 'utf-8');

    expect(commissionTemplate).not.toContain('LogoDisplay');
    expect(commissionTemplate).not.toContain('Émetteur');
    expect(commissionTemplate).not.toContain('Destinataire');
    expect(commissionTemplate).not.toContain('EUR');
    expect(commissionTemplate).toContain('SOCIETE EMETTRICE');
    expect(commissionTemplate).toContain('SOCIETE PARTENAIRE');
    expect(commissionTemplate).toContain('Commission sur course');
    expect(commissionTemplate).toContain('commission mise à disposition');
    expect(commissionTemplate).not.toContain('Commission de gestion');
    expect(commissionTemplate).not.toContain('Facture Client (');
    expect(commissionTemplate).not.toContain('Document confidentiel');
    expect(commissionTemplate).not.toContain('Base client TTC');
    expect(commissionTemplate).not.toContain('Montant reversé chauffeur');
    expect(commissionTemplate).toContain('/photo/logo-invoice-hd.png');
    expect(commissionTemplate).toContain('partnerCompanyName');
    expect(commissionTemplate).toContain('partnerCompanyAddress');
    expect(commissionTemplate).toContain('partnerCompanyVat');
    expect(commissionTemplate).toContain('Chauffeur : {partnerDriverName}');
    expect(commissionTemplate).toContain('Commission TTC');
  });
});
