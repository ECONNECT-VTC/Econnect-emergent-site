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
});
