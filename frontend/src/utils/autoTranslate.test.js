import { startPageTranslation } from './autoTranslate';

describe('automatic page translation', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main>
        <h1>Mes Gains</h1>
        <button aria-label="Modifier">Modifier</button>
        <input placeholder="Rechercher par numéro, client, adresse…" />
      </main>`;
  });

  it('translates rendered text and attributes immediately and on language change', () => {
    let stop = startPageTranslation('en');
    expect(document.querySelector('h1').textContent).toBe('My earnings');
    expect(document.querySelector('button').textContent).toBe('Edit');
    expect(document.querySelector('button').getAttribute('aria-label')).toBe('Edit');
    expect(document.querySelector('input').getAttribute('placeholder')).toBe('Search by number, client, address…');
    stop();
    stop = startPageTranslation('es');
    expect(document.querySelector('h1').textContent).toBe('Mis ganancias');
    stop();
  });

  it('translates newly rendered portal content', async () => {
    const stop = startPageTranslation('en');
    const dialog = document.createElement('div');
    dialog.textContent = 'Annuler la course';
    document.body.appendChild(dialog);
    await Promise.resolve();
    expect(dialog.textContent).toBe('Cancel trip');
    stop();
  });
});
