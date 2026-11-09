import json, unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import feed
from feed import parse,plain,topic
RSS=b'<rss><channel><item><title>Moon crew</title><link>https://nasa.gov/test</link><description>&lt;b&gt;Hi&lt;/b&gt;</description><pubDate>Sun, 08 Nov 2026 12:00:00 GMT</pubDate></item></channel></rss>'
class FeedTests(unittest.TestCase):
 def test_sanitizes(self): self.assertEqual(plain('<script>x()</script><b>Hello &amp; Earth</b>'),'Hello & Earth')
 def test_parse(self):
  s=parse(RSS)[0]
  self.assertEqual(s['topic'],'Human frontiers'); self.assertEqual(s['excerpt'],'Hi');self.assertEqual(s['date'],'2026-11-08T12:00:00+00:00')
 def test_rejects_entity(self):
  for data in [b'<!DOCTYPE rss><rss/>',b'<rss><!ENTITY x "test"></rss>']:
   with self.assertRaises(ValueError): parse(data)
 def test_rejects_bad_link(self):
  with self.assertRaises(ValueError): parse(b'<rss><channel><item><title>x</title><link>javascript:alert(1)</link></item></channel></rss>')
 def test_empty(self):
  with self.assertRaises(ValueError): parse(b'<rss/>')
 def test_size_limit(self):
  with self.assertRaises(ValueError):parse(b'x'*(feed.MAX_BYTES+1))
 def test_topics(self):
  self.assertEqual(topic('Earth ocean'),'Earth & environment'); self.assertEqual(topic('Robot engines'),'Ideas & engineering')
 def test_atom_namespace_and_alternate_link(self):
  data=b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>AI chips</title><link rel="self" href="https://example.com/internal"/><link href="https://example.com/story"/><summary>&lt;p&gt;A summary&lt;/p&gt;</summary><updated>2026-11-08T12:00:00Z</updated></entry></feed>'
  s=parse(data,{'id':'test','name':'Example','topics':['Technology']})[0]
  self.assertEqual(s['url'],'https://example.com/story');self.assertEqual(s['sourceId'],'test');self.assertIn('AI',s['topics']);self.assertIn('Technology',s['topics']);self.assertEqual(s['excerpt'],'A summary')
 def test_id_stable_across_feed_order(self):
  other=b'<item><title>Second story</title><link>https://nasa.gov/second</link></item>'
  before=parse(RSS.replace(b'</channel>',other+b'</channel>'))
  after=parse(RSS.replace(b'<channel>',b'<channel>'+other))
  self.assertEqual({s['url']:s['id'] for s in before},{s['url']:s['id'] for s in after})
 def test_failed_refresh_does_not_destroy_snapshot(self):
  with TemporaryDirectory() as d:
   dest=Path(d)/'feed.json';dest.write_text('{"stories":[]}')
   with patch.object(feed,'DEST',dest),patch('feed.urllib.request.urlopen',side_effect=OSError('offline')):
    with self.assertRaises(ValueError):feed.refresh()
   self.assertEqual(dest.read_text(),'{"stories":[]}')
 def test_partial_refresh_retains_stale_source_and_deduplicates(self):
  with TemporaryDirectory() as d:
   root=Path(d);dest=root/'feed.json';catalog=[{'id':i,'name':i,'feed':'https://'+i+'.example/feed','topics':['World']} for i in ['good','bad']]
   (root/'sources.json').write_text(json.dumps(catalog))
   prior={'stories':[{'id':'old','sourceId':'bad','url':'https://bad.example/old','title':'Old'}],'sources':[{'id':'bad','retrievedAt':'2026-11-01T00:00:00Z'}]};dest.write_text(json.dumps(prior))
   class Response:
    def __enter__(self):return self
    def __exit__(self,*a):pass
    def read(self,*a):return RSS
   def mock_fetch(req,**kwargs):
    if 'bad.example' in req.full_url:raise OSError('offline')
    return Response()
   with patch.object(feed,'ROOT',root),patch.object(feed,'DEST',dest),patch('feed.urllib.request.urlopen',side_effect=mock_fetch):result=feed.refresh()
   self.assertEqual(len(result['stories']),2);self.assertEqual(result['sources'][1]['status'],'stale');self.assertEqual(result['sources'][1]['retrievedAt'],'2026-11-01T00:00:00Z')
if __name__=='__main__': unittest.main()
