// Siva's built-in cybersecurity dictionary. Plain-English definitions so Siva understands and
// explains terminology, acronyms and simple words — even when the AI is off. Fuzzy-matched, so a
// mispronounced or mis-typed term ("fishing", "ransom ware", "ran som ware") still resolves.
import { bestFuzzyMatch, normalizeWord, type FuzzyCandidate } from './fuzzy';

export interface GlossaryTerm {
  term: string;
  aliases: string[]; // extra spellings / acronyms
  category: 'attack' | 'malware' | 'defense' | 'concept' | 'vuln' | 'network' | 'crypto' | 'identity';
  short: string; // one-line, plain English
  more?: string; // optional extra sentence
  example?: string;
}

export const GLOSSARY: GlossaryTerm[] = [
  { term: 'Phishing', aliases: ['fishing'], category: 'attack', short: 'A trick email, text or message that pretends to be from someone you trust, to steal your password or money or to make you open a bad file.', example: 'A fake "your account is locked" email with a link to a copycat login page.' },
  { term: 'Spear phishing', aliases: ['spearphishing'], category: 'attack', short: 'A phishing attack aimed at one specific person or company, using real details about them so it feels believable.' },
  { term: 'Smishing', aliases: [], category: 'attack', short: 'Phishing done over SMS text messages instead of email.' },
  { term: 'Vishing', aliases: [], category: 'attack', short: 'Phishing done over a phone call, where the caller pretends to be your bank, IT support or the police.' },
  { term: 'Social engineering', aliases: [], category: 'attack', short: 'Tricking a person (not a computer) into giving access or information, by lying, pressuring or pretending to be someone they trust.' },
  { term: 'Malware', aliases: ['malicious software'], category: 'malware', short: 'Any software made to harm, spy on or take control of a device. It is a short name for "malicious software".', more: 'Viruses, worms, trojans, ransomware, spyware and stealers are all types of malware.' },
  { term: 'Ransomware', aliases: ['ransom ware'], category: 'malware', short: 'Malware that locks your files by scrambling them, then demands money (a ransom) to unlock them. Many groups also steal the files first and threaten to leak them.' },
  { term: 'Virus', aliases: [], category: 'malware', short: 'Malware that hides inside a normal file or program and spreads to other files when that program runs.' },
  { term: 'Worm', aliases: [], category: 'malware', short: 'Malware that copies itself from computer to computer across a network by itself, without anyone opening a file.' },
  { term: 'Trojan', aliases: ['trojan horse', 'rat', 'remote access trojan'], category: 'malware', short: 'Malware that pretends to be a useful or normal program, but secretly does something harmful once you run it. A "RAT" (remote access trojan) lets an attacker control your device from afar.' },
  { term: 'Spyware', aliases: [], category: 'malware', short: 'Malware that quietly watches what you do, such as what you type or which sites you visit, and sends it to an attacker.' },
  { term: 'Stealer', aliases: ['infostealer', 'information stealer'], category: 'malware', short: 'Malware that grabs saved passwords, browser cookies, crypto wallets and other secrets from an infected computer and sends them to the attacker.' },
  { term: 'Botnet', aliases: ['bot net'], category: 'malware', short: 'A large group of infected computers that an attacker controls together, often used to launch attacks or send spam. Each infected machine is a "bot".' },
  { term: 'Rootkit', aliases: [], category: 'malware', short: 'Malware that hides deep in a system to stay invisible and keep control, even after a restart.' },
  { term: 'Loader', aliases: ['dropper'], category: 'malware', short: 'A small first-stage program whose only job is to quietly download and run the real malware.' },
  { term: 'Wiper', aliases: [], category: 'malware', short: 'Malware made purely to destroy data, with no way to recover it. Unlike ransomware, it does not want money.' },
  { term: 'Zero-day', aliases: ['0-day', 'zero day', 'oh day'], category: 'vuln', short: 'A security hole that the software maker does not yet know about or has not fixed, so there is no patch. Attackers who find it first can use it before anyone can defend.', example: 'A new flaw in a VPN being exploited while the vendor is still writing the fix.' },
  { term: 'Vulnerability', aliases: ['vuln', 'security hole', 'flaw'], category: 'vuln', short: 'A weakness or bug in software or settings that an attacker can misuse to break in or cause harm.' },
  { term: 'Exploit', aliases: [], category: 'attack', short: 'A piece of code or a technique that takes advantage of a vulnerability to actually break in or run attacker code.' },
  { term: 'CVE', aliases: ['common vulnerabilities and exposures'], category: 'vuln', short: 'A public ID number for one specific known vulnerability, like CVE-2024-3400. It lets everyone refer to the same flaw.' },
  { term: 'CVSS', aliases: ['common vulnerability scoring system'], category: 'vuln', short: 'A severity score from 0 to 10 for a vulnerability. Higher means more dangerous. But a high score does not always mean attackers are using it.' },
  { term: 'CISA KEV', aliases: ['kev', 'known exploited vulnerabilities'], category: 'vuln', short: "A list by the US cyber agency (CISA) of vulnerabilities that are confirmed to be used in real attacks right now. If a flaw is on it, patch it first." },
  { term: 'Patch', aliases: ['patching', 'update'], category: 'defense', short: 'A fix released by the software maker that closes a security hole. Installing patches quickly is one of the best defences.' },
  { term: 'Remote code execution', aliases: ['rce', 'arbitrary code execution'], category: 'vuln', short: 'A serious flaw that lets an attacker run their own commands or programs on your device from somewhere else. Often the worst kind of bug.' },
  { term: 'Privilege escalation', aliases: ['privesc', 'elevation of privilege'], category: 'attack', short: 'When an attacker who has limited access finds a way to gain more power, such as becoming an administrator.' },
  { term: 'Authentication bypass', aliases: ['auth bypass'], category: 'vuln', short: 'A flaw that lets someone get in without the correct password or login, skipping the security check.' },
  { term: 'SQL injection', aliases: ['sqli'], category: 'attack', short: 'An attack where bad input is typed into a website so that it tricks the database into running the attacker’s commands, often to steal data.' },
  { term: 'Cross-site scripting', aliases: ['xss'], category: 'attack', short: 'A web flaw that lets an attacker run their own scripts in other people’s browsers on a trusted site, often to steal sessions or data.' },
  { term: 'Supply chain attack', aliases: ['supply-chain attack'], category: 'attack', short: 'An attack that hides malware inside trusted software, a library or an update, so that everyone who installs it gets infected.', example: 'A poisoned package on npm or PyPI that thousands of developers download.' },
  { term: 'Denial of service', aliases: ['dos', 'distributed denial of service'], category: 'attack', short: 'Flooding a website or service with so much traffic or so many requests that it slows down or goes offline for real users. "DDoS" means the flood comes from many machines at once.' },
  { term: 'Man in the middle', aliases: ['mitm', 'man-in-the-middle'], category: 'attack', short: 'When an attacker secretly sits between you and the site or person you are talking to, able to read or change what passes through.' },
  { term: 'Brute force', aliases: ['brute-force'], category: 'attack', short: 'Guessing passwords by trying many of them quickly. "Credential stuffing" reuses passwords leaked from other breaches.' },
  { term: 'Command and control', aliases: ['c2', 'c&c', 'cnc'], category: 'network', short: 'The server an attacker uses to send orders to malware on an infected machine and to receive stolen data back. Often shortened to "C2".' },
  { term: 'Lateral movement', aliases: [], category: 'attack', short: 'After breaking into one computer, the attacker spreads sideways to reach other machines inside the same network.' },
  { term: 'Persistence', aliases: [], category: 'attack', short: 'The tricks an attacker uses to stay inside a system even after a restart or a password change.' },
  { term: 'Exfiltration', aliases: ['data exfiltration'], category: 'attack', short: 'Secretly copying and sending stolen data out of a network to the attacker.' },
  { term: 'Payload', aliases: [], category: 'malware', short: 'The actual harmful part of an attack — the code that does the damage once it runs.' },
  { term: 'Backdoor', aliases: [], category: 'malware', short: 'A hidden way into a system that an attacker leaves behind so they can come back later without logging in normally.' },
  { term: 'Threat actor', aliases: ['threat group', 'adversary'], category: 'concept', short: 'The person or group behind an attack. Can be criminals, spies working for a country, or activists.' },
  { term: 'APT', aliases: ['advanced persistent threat'], category: 'concept', short: 'A skilled, well-funded attacker (often state-sponsored) that quietly stays inside a target for a long time. "Advanced Persistent Threat".' },
  { term: 'Nation-state actor', aliases: ['state-sponsored', 'nation state'], category: 'concept', short: 'An attacker working for or paid by a government, usually for spying or sabotage.' },
  { term: 'MITRE ATT&CK', aliases: ['attack framework', 'mitre attack'], category: 'concept', short: 'A free, widely used catalogue that lists the tactics and techniques attackers use, each with an ID like T1059. Defenders use it to understand and detect attacks.' },
  { term: 'IOC', aliases: ['indicator of compromise', 'indicators of compromise'], category: 'concept', short: 'A clue that a system may be hacked, such as a bad IP address, domain, file hash or filename. "Indicator of Compromise".' },
  { term: 'Hash', aliases: ['file hash', 'md5', 'sha256', 'checksum'], category: 'crypto', short: 'A short fingerprint calculated from a file. The same file always gives the same hash, so it is used to recognise a known good or bad file.' },
  { term: 'Encryption', aliases: ['encrypt', 'encrypted'], category: 'crypto', short: 'Scrambling data with a key so only someone with the right key can read it. It protects data from being read if it is stolen or intercepted.' },
  { term: 'VPN', aliases: ['virtual private network'], category: 'network', short: 'A tool that makes an encrypted tunnel for your internet traffic, often to connect safely to a workplace network. VPN gateways are a common attacker target.' },
  { term: 'Firewall', aliases: [], category: 'defense', short: 'A filter that controls which network traffic is allowed in or out, blocking connections that are not permitted.' },
  { term: 'MFA', aliases: ['multi-factor authentication', 'two-factor authentication', '2fa'], category: 'identity', short: 'Logging in with more than just a password — for example a password plus a code from your phone. It stops most password-only attacks.' },
  { term: 'Credential', aliases: ['credentials'], category: 'identity', short: 'The details used to log in, usually a username and password. Stolen credentials are one of the most common ways attackers get in.' },
  { term: 'Privileged access', aliases: ['admin access', 'administrator', 'root'], category: 'identity', short: 'High-power accounts (like administrator or root) that can change almost anything. Attackers want these most.' },
  { term: 'Zero trust', aliases: ['zero-trust'], category: 'defense', short: 'A security approach that trusts no one by default — every user and device must prove itself for every request, even inside the network.' },
  { term: 'EDR', aliases: ['endpoint detection and response'], category: 'defense', short: 'Security software on computers and servers that watches for suspicious behaviour and helps responders investigate and stop attacks. "Endpoint Detection and Response".' },
  { term: 'SIEM', aliases: ['security information and event management'], category: 'defense', short: 'A system that collects logs from across an organisation and raises alerts when something looks like an attack.' },
  { term: 'SOC', aliases: ['security operations center', 'security operations centre'], category: 'defense', short: 'The team (and room) that watches for and responds to cyber attacks around the clock. "Security Operations Centre".' },
  { term: 'Incident response', aliases: ['ir', 'dfir'], category: 'defense', short: 'The organised process of handling a cyber attack: finding it, stopping it, cleaning up and learning from it.' },
  { term: 'Threat intelligence', aliases: ['threat intel', 'cti'], category: 'concept', short: 'Collected knowledge about attackers, their tools and their methods, used to defend better. This whole app is a threat-intelligence tool.' },
  { term: 'Attack surface', aliases: [], category: 'concept', short: 'All the points where an attacker could try to get in — every exposed service, login page, device or piece of software.' },
  { term: 'Patch Tuesday', aliases: [], category: 'defense', short: 'The second Tuesday of each month, when Microsoft and some other vendors release their regular batch of security fixes.' },
  { term: 'Double extortion', aliases: [], category: 'attack', short: 'A ransomware tactic: the gang both scrambles your files AND steals a copy, threatening to leak it unless you pay.' },
  { term: 'Leak site', aliases: ['leak-site', 'data leak site'], category: 'concept', short: 'A dark-web page where a ransomware gang names its victims and threatens to publish stolen data. A listing there is a claim, not proof.' },
  { term: 'Patch gap', aliases: [], category: 'concept', short: 'The risky period between when a fix is released and when you actually install it. Attackers rush to exploit flaws during this gap.' },
  { term: 'Sandbox', aliases: [], category: 'defense', short: 'A safe, isolated space where a suspicious file or program can be run and watched without risking the real system.' },
  { term: 'Threat hunting', aliases: ['threat hunt'], category: 'defense', short: 'Actively searching through systems and logs to find attackers who slipped past automatic defences.' },
  // ---- patch 9: more core knowledge ----
  { term: 'CWE', aliases: ['common weakness enumeration', 'weakness type'], category: 'vuln', short: 'A catalogue of TYPES of software mistakes (like "SQL injection" = CWE-89). A CVE is one specific bug; a CWE is the kind of mistake behind it.' },
  { term: 'EPSS', aliases: ['exploit prediction scoring system'], category: 'vuln', short: 'A free daily score (0–100%) estimating how likely a CVE is to be exploited in the next 30 days. It helps decide what to patch first, alongside CVSS (how bad) and KEV (already exploited).' },
  { term: 'OWASP Top 10', aliases: ['owasp'], category: 'vuln', short: 'A widely used list of the ten most important web application security risks, published by the OWASP community (for example broken access control and injection).' },
  { term: 'Broken access control', aliases: ['idor', 'insecure direct object reference'], category: 'vuln', short: 'When an app does not properly check WHO is allowed to see or change something, so a user can reach other people’s data just by changing a link or ID.' },
  { term: 'Command injection', aliases: ['os command injection'], category: 'vuln', short: 'A bug where user input ends up inside a system command, letting an attacker run their own commands on the server.' },
  { term: 'Path traversal', aliases: ['directory traversal'], category: 'vuln', short: 'A bug where tricks like "../" in a file name let an attacker read or write files outside the folder the app meant to allow.' },
  { term: 'Deserialization', aliases: ['insecure deserialization', 'deserialisation'], category: 'vuln', short: 'Turning stored or received data back into program objects. If untrusted data is deserialised unsafely, an attacker can often make the program run their code.' },
  { term: 'SSRF', aliases: ['server-side request forgery', 'server side request forgery'], category: 'vuln', short: 'A bug that lets an attacker make the server send web requests on their behalf — often to internal systems or cloud metadata that should be private.' },
  { term: 'CSRF', aliases: ['cross-site request forgery', 'cross site request forgery'], category: 'vuln', short: 'A trick that makes your logged-in browser send an unwanted action to a site (like changing your email) without you noticing.' },
  { term: 'Buffer overflow', aliases: ['memory corruption', 'heap overflow', 'stack overflow', 'out-of-bounds write'], category: 'vuln', short: 'A bug where a program writes more data than a memory area can hold, overwriting nearby memory. Attackers can use it to crash the program or run their own code.' },
  { term: 'Use after free', aliases: ['uaf'], category: 'vuln', short: 'A memory bug where a program keeps using memory after releasing it. Common in browsers and often turned into code execution.' },
  { term: 'Misconfiguration', aliases: ['security misconfiguration', 'misconfigured'], category: 'vuln', short: 'A system set up insecurely — default passwords, public storage buckets, unnecessary open ports — rather than a bug in the code.' },
  { term: 'Hardcoded credentials', aliases: ['default credentials', 'default password'], category: 'vuln', short: 'Passwords or keys written into software or left at factory defaults, which attackers can look up and use.' },
  { term: 'Credential stuffing', aliases: [], category: 'attack', short: 'Trying usernames and passwords leaked from one site on many other sites, hoping people reused them.' },
  { term: 'Password spraying', aliases: [], category: 'attack', short: 'Trying a few very common passwords against many accounts, slowly, to avoid lock-outs.' },
  { term: 'Session hijacking', aliases: ['cookie theft', 'token theft', 'pass the cookie'], category: 'attack', short: 'Stealing the login token or cookie that keeps you signed in, so the attacker can use your account without your password or MFA.' },
  { term: 'MFA fatigue', aliases: ['mfa bombing', 'push bombing', 'push fatigue'], category: 'attack', short: 'Flooding someone with login approval prompts until they tap "Approve" just to make it stop.' },
  { term: 'Business email compromise', aliases: ['bec', 'ceo fraud'], category: 'attack', short: 'A scam where attackers take over or imitate a business email account to trick staff into paying fake invoices or sending sensitive data.' },
  { term: 'Watering hole attack', aliases: ['watering hole'], category: 'attack', short: 'Hacking a website that a target group often visits, so visitors get infected.' },
  { term: 'Drive-by download', aliases: ['drive by download'], category: 'attack', short: 'Malware that installs just by visiting a malicious or hacked web page, usually through an unpatched browser or plugin.' },
  { term: 'Malvertising', aliases: ['malicious advertising'], category: 'attack', short: 'Malicious ads — often in search results — that lead people to fake download sites or malware.' },
  { term: 'Typosquatting', aliases: ['lookalike domain', 'dependency confusion'], category: 'attack', short: 'Registering names that look like real ones (a domain like "rnicrosoft.com" or a software package with a near-identical name) to trick people.' },
  { term: 'Living off the land', aliases: ['lotl', 'lolbins', 'lolbas'], category: 'attack', short: 'Attackers using the normal tools already on a system (PowerShell, WMI, remote desktop) instead of their own malware, so they blend in.' },
  { term: 'Credential dumping', aliases: ['mimikatz', 'lsass dump'], category: 'attack', short: 'Pulling saved passwords and password hashes out of a computer’s memory or files, to use them to log in elsewhere.' },
  { term: 'Pass the hash', aliases: ['pass-the-hash', 'pth'], category: 'attack', short: 'Logging in with a stolen password HASH instead of the password itself, which some Windows systems accept.' },
  { term: 'Kerberoasting', aliases: ['kerberoast'], category: 'attack', short: 'An Active Directory attack that requests service tickets and cracks them offline to recover service-account passwords.' },
  { term: 'Initial access broker', aliases: ['iab', 'access broker'], category: 'attack', short: 'A criminal who breaks into companies and sells that access to other groups, often ransomware gangs.' },
  { term: 'Ransomware as a service', aliases: ['raas', 'affiliate'], category: 'malware', short: 'A business model where ransomware developers rent their malware to "affiliates" who carry out attacks and share the ransom.' },
  { term: 'Cryptojacking', aliases: ['cryptominer', 'coin miner'], category: 'malware', short: 'Secretly using someone’s computer or cloud account to mine cryptocurrency.' },
  { term: 'Keylogger', aliases: ['key logger'], category: 'malware', short: 'Malware or a device that records every key you press, to capture passwords and messages.' },
  { term: 'Web shell', aliases: ['webshell'], category: 'malware', short: 'A small malicious script planted on a web server that gives an attacker remote control through a web browser.' },
  { term: 'Fileless malware', aliases: ['fileless'], category: 'malware', short: 'Malware that runs mainly in memory or through built-in tools, leaving few files on disk, which makes it harder to detect.' },
  { term: 'Bootkit', aliases: ['uefi bootkit'], category: 'malware', short: 'Malware that infects the start-up process (boot or UEFI firmware) so it runs before the operating system and survives reinstalls.' },
  { term: 'Penetration test', aliases: ['pentest', 'pen test', 'ethical hacking'], category: 'defense', short: 'An authorised, simulated attack by security professionals to find weaknesses before criminals do.' },
  { term: 'Red team', aliases: ['blue team', 'purple team'], category: 'defense', short: 'Red team = authorised attackers testing defences; blue team = defenders; purple team = both working together to improve detection.' },
  { term: 'Vulnerability management', aliases: ['vuln management', 'patch management'], category: 'defense', short: 'The ongoing cycle of finding, ranking and fixing security weaknesses across all your systems.' },
  { term: 'Least privilege', aliases: ['principle of least privilege'], category: 'defense', short: 'Giving every user and program only the access it truly needs, so a single compromise does less damage.' },
  { term: 'Network segmentation', aliases: ['segmentation', 'microsegmentation'], category: 'defense', short: 'Splitting a network into separate zones so an attacker who gets into one part cannot easily reach the rest.' },
  { term: 'Backup', aliases: ['offline backup', 'immutable backup', '3-2-1 backup'], category: 'defense', short: 'Copies of your data kept safely — ideally offline or unchangeable — so you can recover after ransomware without paying.' },
  { term: 'Hardening', aliases: ['system hardening'], category: 'defense', short: 'Reducing a system’s attack surface by turning off unneeded features, closing ports and applying secure settings.' },
  { term: 'WAF', aliases: ['web application firewall'], category: 'defense', short: 'A filter in front of a website that blocks common attacks like SQL injection and cross-site scripting.' },
  { term: 'XDR', aliases: ['extended detection and response', 'mdr', 'managed detection and response'], category: 'defense', short: 'Security tooling (or a managed service) that collects signals from endpoints, email, network and cloud to detect and respond to attacks in one place.' },
  { term: 'DLP', aliases: ['data loss prevention'], category: 'defense', short: 'Tools and rules that stop sensitive data from leaving the organisation by mistake or on purpose.' },
  { term: 'SBOM', aliases: ['software bill of materials'], category: 'defense', short: 'A list of every component inside a piece of software, so you can quickly tell if you are affected by a new vulnerability.' },
  { term: 'YARA', aliases: ['yara rule'], category: 'defense', short: 'A pattern-matching language defenders use to describe and find malware files.' },
  { term: 'Sigma', aliases: ['sigma rule'], category: 'defense', short: 'A shared format for writing log-detection rules once and using them in many SIEM tools.' },
  { term: 'Honeypot', aliases: ['honeytoken', 'canary token'], category: 'defense', short: 'A decoy system or fake credential that has no real use, so anyone touching it is almost certainly an attacker.' },
  { term: 'Digital forensics', aliases: ['forensics', 'dfir'], category: 'defense', short: 'Collecting and analysing evidence after an incident to find out what happened, how, and what was affected.' },
  { term: 'Security awareness training', aliases: ['awareness training', 'phishing simulation'], category: 'defense', short: 'Teaching people to recognise scams and unsafe behaviour, often with practice phishing emails.' },
  { term: 'Active Directory', aliases: ['domain controller', 'entra id'], category: 'identity', short: 'Microsoft’s system for managing users, computers and permissions in an organisation. Taking it over usually means control of the whole network.' },
  { term: 'Single sign-on', aliases: ['sso', 'saml', 'oauth', 'openid connect'], category: 'identity', short: 'One login that gives access to many apps. Convenient, but it makes that one account very valuable to attackers.' },
  { term: 'Passkey', aliases: ['fido2', 'webauthn', 'security key'], category: 'identity', short: 'A phishing-resistant way to sign in using your device (fingerprint, face or PIN) instead of a password.' },
  { term: 'DNS', aliases: ['domain name system', 'dns hijacking', 'dns tunneling'], category: 'network', short: 'The internet’s phone book, turning names like example.com into addresses. Attackers abuse it to redirect traffic or hide data transfers.' },
  { term: 'Port', aliases: ['open port', 'port scan'], category: 'network', short: 'A numbered door on a computer for a network service (443 for HTTPS, 3389 for remote desktop). Unneeded open ports increase risk.' },
  { term: 'RDP', aliases: ['remote desktop', 'remote desktop protocol'], category: 'network', short: 'Windows remote desktop. Exposed to the internet, it is a top way ransomware gangs break in.' },
  { term: 'DDoS', aliases: ['distributed denial of service'], category: 'network', short: 'Overwhelming a website or service with traffic from many machines at once so real users cannot reach it.' },
  { term: 'TLS', aliases: ['ssl', 'certificate'], category: 'crypto', short: 'The encryption that protects data travelling between your browser and a website (the padlock / HTTPS).' },
  { term: 'Public key cryptography', aliases: ['asymmetric encryption', 'public key', 'private key', 'pki'], category: 'crypto', short: 'Encryption using a pair of keys: a public one anyone can use to lock or verify, and a private one only the owner keeps to unlock or sign.' },
  { term: 'Post-quantum cryptography', aliases: ['pqc', 'quantum safe'], category: 'crypto', short: 'New encryption methods designed to stay secure even against future quantum computers.' },
  { term: 'Data breach', aliases: ['breach', 'data leak'], category: 'concept', short: 'An incident where data is accessed or stolen by someone who should not have it.' },
  { term: 'Cyber risk', aliases: ['risk assessment'], category: 'concept', short: 'How likely something bad is to happen multiplied by how much damage it would do. Security work is about reducing it.' },
  { term: 'Defense in depth', aliases: ['layered security'], category: 'concept', short: 'Using several layers of protection, so if one fails, others still stop or slow the attacker.' },
  { term: 'Cyber kill chain', aliases: ['kill chain'], category: 'concept', short: 'A model of the stages of an attack — from research and break-in to taking action — so defenders can stop it at any stage.' },
  { term: 'TTP', aliases: ['ttps', 'tactics techniques and procedures'], category: 'concept', short: 'Tactics, techniques and procedures: HOW an attacker usually operates. Tracking TTPs helps catch them even when their tools change.' },
  { term: 'Dark web', aliases: ['darknet', 'tor'], category: 'concept', short: 'Parts of the internet reachable only with special software like Tor, where stolen data and hacking services are often traded.' },
  { term: 'NIST CSF', aliases: ['nist cybersecurity framework', 'cybersecurity framework'], category: 'concept', short: 'A widely used framework that organises security work into Govern, Identify, Protect, Detect, Respond and Recover.' },
  { term: 'CERT-In', aliases: ['cert in', 'indian computer emergency response team'], category: 'concept', short: 'India’s national agency for cybersecurity incidents. It publishes advisories and requires organisations to report certain incidents quickly.' },
];

let candidates: FuzzyCandidate[] | null = null;
function buildCandidates(): FuzzyCandidate[] {
  if (candidates) return candidates;
  const out: FuzzyCandidate[] = [];
  for (const t of GLOSSARY) for (const name of [t.term, ...t.aliases]) out.push({ key: normalizeWord(name), value: t.term });
  candidates = out;
  return out;
}

const byTerm = new Map(GLOSSARY.map((t) => [t.term, t]));

/** Exact or very-close match for a single term (handles acronyms and small typos). */
export function lookupTerm(query: string): GlossaryTerm | null {
  const q = normalizeWord(query);
  if (!q) return null;
  for (const t of GLOSSARY) if (normalizeWord(t.term) === q || t.aliases.some((a) => normalizeWord(a) === q)) return t;
  const fuzzy = bestFuzzyMatch(query, buildCandidates(), 0.8);
  return fuzzy ? byTerm.get(fuzzy.value) ?? null : null;
}

/** Terms whose name or definition appears in a free-text question, so Siva can explain them. */
export function findTermsInText(text: string, limit = 4): GlossaryTerm[] {
  const words = text.toLowerCase().split(/[^a-z0-9&]+/).filter(Boolean);
  const wordSet = new Set(words);
  const joined = ` ${words.join(' ')} `;
  const found: GlossaryTerm[] = [];
  for (const t of GLOSSARY) {
    const names = [t.term, ...t.aliases];
    const hit = names.some((n) => {
      const nn = n.toLowerCase();
      return nn.includes(' ') || nn.includes('&') ? joined.includes(` ${nn} `) : wordSet.has(nn);
    });
    if (hit) found.push(t);
    if (found.length >= limit) break;
  }
  return found;
}

/** A compact primer of the most common terms, to steer the AI toward explaining jargon simply. */
export function glossaryPrimer(): string {
  const core = ['Vulnerability', 'Zero-day', 'CVE', 'CVSS', 'CISA KEV', 'Remote code execution', 'Ransomware', 'Malware', 'Phishing', 'Command and control', 'Threat actor', 'APT', 'IOC', 'MFA', 'Patch'];
  return core.map((name) => byTerm.get(name)).filter(Boolean).map((t) => `${t!.term}: ${t!.short}`).join('\n');
}
