/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const root = path.resolve(__dirname, '..');
const inputPath = path.join(root, 'docs', 'manual-usuario.md');
const outputPath = path.join(root, 'docs', 'manual-usuario.docx');

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cleanInline(value) {
  return value.replace(/`([^`]+)`/g, '$1').trim();
}

function textRun(text, options = {}) {
  const props = [];

  if (options.bold) props.push('<w:b/>');
  if (options.size) props.push(`<w:sz w:val="${options.size}"/>`);
  if (options.color) props.push(`<w:color w:val="${options.color}"/>`);

  const runProps = props.length ? `<w:rPr>${props.join('')}</w:rPr>` : '';
  return `<w:r>${runProps}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function paragraph(text, options = {}) {
  const pProps = [];

  if (options.style) pProps.push(`<w:pStyle w:val="${options.style}"/>`);
  if (options.list) {
    pProps.push(
      '<w:numPr>',
      `<w:ilvl w:val="${options.indent || 0}"/>`,
      `<w:numId w:val="${options.list === 'number' ? 2 : 1}"/>`,
      '</w:numPr>'
    );
  }

  const props = pProps.length ? `<w:pPr>${pProps.join('')}</w:pPr>` : '';
  return `<w:p>${props}${textRun(text, options)}</w:p>`;
}

function markdownToParagraphs(markdown) {
  const lines = markdown.split(/\r?\n/);
  const body = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      body.push('<w:p/>');
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      body.push(paragraph(cleanInline(heading[2]), {
        style: level === 1 ? 'Title' : level === 2 ? 'Heading1' : 'Heading2',
        bold: true,
        size: level === 1 ? 34 : level === 2 ? 28 : 24,
        color: level === 1 ? '1F4E3D' : '2F6B4F',
      }));
      continue;
    }

    const unordered = trimmed.match(/^-\s+(.+)$/);
    if (unordered) {
      body.push(paragraph(cleanInline(unordered[1]), { list: 'bullet', indent: 0 }));
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      body.push(paragraph(cleanInline(ordered[1]), { list: 'number', indent: 0 }));
      continue;
    }

    body.push(paragraph(cleanInline(trimmed), { size: 22 }));
  }

  return body.join('');
}

const markdown = fs.readFileSync(inputPath, 'utf8');
const body = markdownToParagraphs(markdown);

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:pPr><w:spacing w:after="240"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="34"/><w:color w:val="1F4E3D"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="Heading 1"/>
    <w:pPr><w:spacing w:before="260" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="2F6B4F"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="Heading 2"/>
    <w:pPr><w:spacing w:before="180" w:after="100"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="6A4D18"/></w:rPr>
  </w:style>
</w:styles>`;

const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="•"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
      <w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr>
    </w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="2">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>
</w:numbering>`;

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

async function main() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.folder('_rels').file('.rels', relsXml);
  const word = zip.folder('word');
  word.file('document.xml', documentXml);
  word.file('styles.xml', stylesXml);
  word.file('numbering.xml', numberingXml);
  word.folder('_rels').file('document.xml.rels', documentRelsXml);

  const content = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(outputPath, content);
  console.log(`Created ${path.relative(root, outputPath)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
