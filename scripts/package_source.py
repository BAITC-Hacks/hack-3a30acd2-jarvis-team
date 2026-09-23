"""Build a source-only handoff archive from an explicit allowlist."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / 'TaskUp-AI-source.zip'
ROOT_FILES = ['README.md', 'API_CONTRACT.md', 'DEMO_SCRIPT.md', 'TEAM_PLAN.md', 'VERIFICATION.md', '.gitignore']
DIRECTORIES = ['backend/app', 'backend/prompts', 'backend/tests', 'frontend/src', 'frontend/tests', 'seed', 'docs', 'scripts']
EXTRA_FILES = ['backend/requirements.txt', 'backend/pytest.ini', 'backend/.env.example', 'backend/data/.gitkeep',
               'frontend/package.json', 'frontend/package-lock.json', 'frontend/index.html',
               'frontend/tsconfig.json', 'frontend/vite.config.ts', 'frontend/playwright.config.ts', 'frontend/.env.example']
files = [ROOT / name for name in ROOT_FILES + EXTRA_FILES]
for directory in DIRECTORIES:
    files += [p for p in (ROOT / directory).rglob('*') if p.is_file() and '__pycache__' not in p.parts
              and p.suffix not in {'.pyc', '.db', '.sqlite', '.zip'} and p.name != '.env']
with ZipFile(DESTINATION, 'w', ZIP_DEFLATED) as archive:
    for source in sorted(set(files)):
        archive.write(source, Path('TaskUp-AI') / source.relative_to(ROOT))
with ZipFile(DESTINATION) as archive:
    assert archive.testzip() is None
    assert not any('/node_modules/' in name or '/.venv/' in name or name.endswith('/.env') for name in archive.namelist())
    print(f'Source archive verified: {len(archive.namelist())} files, {DESTINATION.stat().st_size} bytes.')
