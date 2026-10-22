"""Read-only pattern audit of unique blobs reachable from every local Git ref.
Reports rule names and paths only, never matched credential values.
Not a proof of absence; encoded, fragmented and unknown formats may be missed.
"""
import subprocess, re, json, collections

def git(*args): return subprocess.check_output(['git',*args])
objects={}
for line in git('rev-list','--objects','--all').decode().splitlines():
    sha, _, path=line.partition(' ')
    if path: objects.setdefault(sha,path)
patterns={
 'private_key':r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
 'github_token':r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b',
 'aws_key':r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
 'stripe_secret':r'\bsk_live_[A-Za-z0-9]{20,}\b',
 'openai_key':r'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b',
 'jwt':r'\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}\b',
 'credential_uri':r'(?:postgres(?:ql)?|mongodb(?:\+srv)?|rediss?)://[^\s:/]+:[^\s@]+@',
}
compiled={name:re.compile(pattern) for name,pattern in patterns.items()}
findings=[]; scanned=0; binary=0
proc=subprocess.Popen(['git','cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE)
for sha,path in objects.items():
    proc.stdin.write((sha+'\n').encode());proc.stdin.flush()
    header=proc.stdout.readline().decode().split()
    size=int(header[2]);content=proc.stdout.read(size);proc.stdout.read(1)
    if header[1]!='blob': continue
    try: text=content.decode('utf-8')
    except UnicodeDecodeError: binary+=1;continue
    if '\x00' in text: binary+=1;continue
    scanned+=1
    for rule,pattern in compiled.items():
        if pattern.search(text):findings.append({'path':path,'blob':sha,'rule':rule})
proc.stdin.close();proc.wait()
result={'branches':len(git('for-each-ref','--format=%(refname)','refs/remotes/origin').decode().splitlines())-1,
 'reachable_commits':int(git('rev-list','--all','--count')),'unique_text_blobs':scanned,
 'binary_blobs_skipped':binary,'findings':findings,
 'scope':'All locally fetched refs; format-based detection, not an exhaustive guarantee.'}
print(json.dumps(result,ensure_ascii=False,indent=2))
