const path = require('path')
const JSZip = require('jszip')

// File names come from user-controlled Yjs state -- basename() strips any
// directory component so a crafted name (e.g. "../../.bashrc") can't
// "zip-slip" its way outside the directory someone extracts this into.
function safeEntryName(name) {
  const base = path.basename(name)
  return base === '' || base === '.' || base === '..' ? null : base
}

async function buildProjectZip(files) {
  const zip = new JSZip()
  for (const file of files) {
    const name = safeEntryName(file.name)
    if (name) zip.file(name, file.content)
  }
  return zip.generateAsync({ type: 'nodebuffer' })
}

module.exports = { buildProjectZip }
