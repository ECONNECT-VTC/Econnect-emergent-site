export default function LegalDocumentContent({ document }) {
  return (
    <article className="space-y-6 break-words">
      <h2 className="text-2xl text-[#D4AF37]">{document.title}</h2>
      {document.sections.map((section, index) => (
        <section key={index} className="space-y-3">
          <h3 className="text-xl text-white">{section.heading}</h3>
          {section.paragraphs.map((text, paragraph) => (
            <p key={paragraph} className="whitespace-pre-line text-[#C7B588]">{text}</p>
          ))}
        </section>
      ))}
    </article>
  );
}
