import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../lib/feedParser';
import { FEEDS } from '../lib/config';

const XML = `<rss version="2.0"><channel><title>ZeroHour</title>
<item>
  <title>CISA Warns of PHP2Shell Vulnerabilities Actively Exploited in Attacks</title>
  <link>https://zerohour.day/item/1e4fc60d5dbab6a40cb24201fcabea3dc81dbd24</link>
  <pubDate>Wed, 28 Oct 2026 18:26:07 GMT</pubDate>
  <source url="https://cybersecuritynews.com/php2shell-vulnerabilities-actively-exploited/">Cyber Security News</source>
  <category>severity:critical</category>
  <description>CISA added two critical PHP flaws to the KEV catalog after confirming exploitation of CVE-2026-109618.

Source: https://cybersecuritynews.com/php2shell-vulnerabilities-actively-exploited/

Analyze with Vani AI: https://c.vani.ai/chat?utm_source=zerohour&amp;q=Explain</description>
</item></channel></rss>`;
const now = new Date('2026-10-28T19:00:00Z');

test('ZeroHour is a built-in feed', () => {
  assert.ok(FEEDS.some((f) => f.url === 'https://zerohour.day/feed.xml?domain=cyber'));
});

test('ZeroHour items cite the original article and publisher, with a clean summary', () => {
  const [item] = parseFeed(XML, 'ZeroHour', false, now, true, true);
  assert.equal(item.url, 'https://cybersecuritynews.com/php2shell-vulnerabilities-actively-exploited');
  assert.equal(item.source, 'Cyber Security News');
  assert.match(item.snippet, /CVE-2026-109618/);
  assert.doesNotMatch(item.snippet, /Vani|Source:/);
});

test('without preferSourceUrl the feed link is kept', () => {
  const [item] = parseFeed(XML, 'Other', false, now);
  assert.match(item.url, /^https:\/\/zerohour\.day\/item\//);
});
