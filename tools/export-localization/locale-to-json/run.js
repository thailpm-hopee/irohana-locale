#!/usr/bin/env node

/**
 * Locale to JSON exporter
 *
 * Reads <projectRoot>/src/i18n/locales/{lang}/common.json and outputs {lang}.json
 * into the tool output dir (under a `json/` subfolder).
 * Also copies any JSON file whose name is a valid ISO 639-1 language code.
 *
 * Usage:
 *   node run.js --project-root=<path>
 */

const fs = require('fs');
const path = require('path');
const { resolveLocalesDir, resolveOutputDir } = require('../../_shared/project');

const LOCALES_DIR = resolveLocalesDir();
const OUTPUT_DIR = path.join(resolveOutputDir('export-localization'), 'json');

// ISO 639-1 language codes
const ISO_CODES = new Set([
  'aa','ab','af','ak','am','an','ar','as','av','ay','az',
  'ba','be','bg','bh','bi','bm','bn','bo','br','bs',
  'ca','ce','ch','co','cr','cs','cu','cv','cy',
  'da','de','dv','dz',
  'ee','el','en','eo','es','et','eu',
  'fa','ff','fi','fj','fo','fr','fy',
  'ga','gd','gl','gn','gu','gv',
  'ha','he','hi','ho','hr','ht','hu','hy','hz',
  'ia','id','ie','ig','ii','ik','io','is','it','iu',
  'ja','jv',
  'ka','kg','ki','kj','kk','kl','km','kn','ko','kr','ks','ku','kv','kw','ky',
  'la','lb','lg','li','ln','lo','lt','lu','lv',
  'mg','mh','mi','mk','ml','mn','mo','mr','ms','mt','my',
  'na','nb','nd','ne','ng','nl','nn','no','nr','nv','ny',
  'oc','oj','om','or','os',
  'pa','pi','pl','ps','pt',
  'qu',
  'rm','rn','ro','ru','rw',
  'sa','sc','sd','se','sg','si','sk','sl','sm','sn','so','sq','sr','ss','st','su','sv','sw',
  'ta','te','tg','th','ti','tk','tl','tn','to','tr','ts','tt','tw','ty',
  'ug','uk','ur','uz',
  've','vi','vo',
  'wa','wo',
  'xh',
  'yi','yo',
  'za','zh','zu',
]);

function main() {
  if (!fs.existsSync(LOCALES_DIR)) {
    console.error(`❌ Locales directory not found: ${LOCALES_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const folders = fs.readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  let count = 0;

  for (const lang of folders) {
    const langDir = path.join(LOCALES_DIR, lang);

    // 1) common.json → {lang}.json
    const commonPath = path.join(langDir, 'common.json');
    if (fs.existsSync(commonPath)) {
      const dest = path.join(OUTPUT_DIR, `${lang}.json`);
      fs.copyFileSync(commonPath, dest);
      console.log(`✅ ${lang}/common.json → ${lang}.json`);
      count++;
    }

    // 2) Any other .json file whose name (without ext) is an ISO 639-1 code
    const files = fs.readdirSync(langDir).filter(f => f.endsWith('.json') && f !== 'common.json');
    for (const file of files) {
      const name = path.basename(file, '.json');
      if (ISO_CODES.has(name)) {
        const dest = path.join(OUTPUT_DIR, file);
        fs.copyFileSync(path.join(langDir, file), dest);
        console.log(`✅ ${lang}/${file} → ${file}`);
        count++;
      }
    }
  }

  console.log(`\n🎉 Done — ${count} file(s) exported to ${OUTPUT_DIR}`);
}

main();
