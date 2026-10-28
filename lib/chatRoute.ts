// Which brain answers: the conversation (like Gemini/ChatGPT) or the deep security research card.
// Pure and browser-safe (used by the server and by the voice screen).
const SECURITY_WORDS = /\b(cve-\d{4}-\d+|t\d{4}(\.\d{3})?|cyber|security|secure|hack(er|ers|ed|ing)?|malware|ransomware|phishing|smishing|vishing|spyware|trojan|worm|virus|botnet|exploit(s|ed)?|vulnerabilit(y|ies)|zero[- ]?day|breach(es)?|leak(ed)?|attack(s|er|ers)?|threat(s)?|apt\d*|mitre|att&ck|cisa|kev|nvd|cvss|epss|patch(es|ed)?|firewall|siem|edr|xdr|soc|ioc|ttp|ddos|dos|sql injection|xss|csrf|ssrf|rce|privilege escalation|lateral movement|credential|password|mfa|2fa|encryption|ransom|lockbit|akira|scattered spider|volt typhoon|cobalt strike|mimikatz|infostealer|stealer|c2|command and control|owasp|nist|iso 27001|pentest|penetration test|red team|blue team|incident response|forensics|dark ?web|cert-in|scan(ner)?|trivy)\b/i;

const CHITCHAT = /^(hi|hello|hey|thanks|thank you|thank u|ok(ay)?|cool|nice|great|good (job|work)|how are you|how r u|what'?s up|who made you|tell me a joke|joke|are you there|you there|good night|bye|see you)\b/i;
const ABOUT_MY_DATA = /\b(my|our|briefing|feed|feeds|dashboard|you read|you have read|update today|today'?s update|reading memory)\b/i;
const GENERAL_FACT = /\b(who|when|where|which|how (many|much|old|far|long|tall)|latest|news|today|tonight|tomorrow|yesterday|this week|current(ly)?|price|cost|weather|temperature|score|won|winner|match|release(d)?|launch(ed)?|ceo|president|prime minister|capital|population|stock|rate)\b/i;

/** Should this go to the deep security research pipeline (answer card), or to a conversation? */
export function isSecurityTopic(q: string): boolean {
  return SECURITY_WORDS.test(q);
}

/** For a conversation: use Google Search (general / current facts) or Siva's own tools? */
export function chooseChatMode(q: string, webSearchOn: boolean): 'chat-tools' | 'chat-web' {
  const t = q.trim();
  if (CHITCHAT.test(t)) return 'chat-tools';
  if (!webSearchOn || ABOUT_MY_DATA.test(t)) return 'chat-tools';
  return GENERAL_FACT.test(t) ? 'chat-web' : 'chat-tools';
}

