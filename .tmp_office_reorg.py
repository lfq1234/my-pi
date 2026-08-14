import os
import shutil

root = r'C:\Users\LENOVO\Desktop\my-pi\packages\office-agent\src'
office = os.path.join(root, 'office')

os.makedirs(os.path.join(office, 'documents', 'readers'), exist_ok=True)
os.makedirs(os.path.join(office, 'documents', 'ingestion'), exist_ok=True)
os.makedirs(os.path.join(office, 'artifacts', 'writers'), exist_ok=True)
os.makedirs(os.path.join(office, 'artifacts', 'tools'), exist_ok=True)
os.makedirs(os.path.join(office, 'workflows'), exist_ok=True)
os.makedirs(os.path.join(office, 'ui'), exist_ok=True)
os.makedirs(os.path.join(office, 'services'), exist_ok=True)
os.makedirs(os.path.join(office, 'runtime'), exist_ok=True)
os.makedirs(os.path.join(office, 'agents'), exist_ok=True)

moves = [
    ('ingestion', os.path.join(office, 'documents', 'ingestion')),
    ('readers', os.path.join(office, 'documents', 'readers')),
    ('writers', os.path.join(office, 'artifacts', 'writers')),
    ('tools', os.path.join(office, 'artifacts', 'tools')),
    ('workflows', os.path.join(office, 'workflows')),
    ('ui', os.path.join(office, 'ui')),
    ('services', os.path.join(office, 'services')),
    ('runtime', os.path.join(office, 'runtime')),
]

for src_name, dst in moves:
    src = os.path.join(root, src_name)
    if os.path.isdir(src):
        for entry in os.listdir(src):
            s = os.path.join(src, entry)
            d = os.path.join(dst, entry)
            if os.path.isdir(d) and os.path.exists(d):
                shutil.rmtree(d)
            elif os.path.isfile(d) and os.path.exists(d):
                os.remove(d)
            shutil.move(s, d)
        try:
            os.rmdir(src)
        except OSError:
            pass

agents_src = os.path.join(root, 'agents')
if os.path.isdir(agents_src):
    shutil.rmtree(agents_src)

# Remove empty top-level office leftovers if present
for name in ['core', 'cli', 'bun', 'email-generator.ts', 'html-generator.ts', 'office-agent.ts', 'poster-brief.ts', 'types.ts', 'utils.ts', 'index.ts', 'office']:
    path = os.path.join(root, name)
    if os.path.isdir(path):
        if not os.listdir(path):
            os.rmdir(path)

print('office-agent reorg complete')
