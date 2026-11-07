import unittest
from feed import parse,plain,topic
class FeedTests(unittest.TestCase):
 def test_sanitizes(self): self.assertEqual(plain('<script>x()</script><b>Hello &amp; Earth</b>'),'x() Hello & Earth')
 def test_parse(self):
  s=parse(b'<rss><channel><item><title>Moon crew</title><link>https://nasa.gov/test</link><description>&lt;b&gt;Hi&lt;/b&gt;</description></item></channel></rss>')[0]
  self.assertEqual(s['topic'],'Human frontiers'); self.assertEqual(s['excerpt'],'Hi')
 def test_rejects_entity(self):
  with self.assertRaises(ValueError): parse(b'<!DOCTYPE rss><rss/>')
 def test_rejects_bad_link(self):
  with self.assertRaises(ValueError): parse(b'<rss><channel><item><title>x</title><link>javascript:alert(1)</link></item></channel></rss>')
 def test_empty(self):
  with self.assertRaises(ValueError): parse(b'<rss/>')
 def test_topics(self):
  self.assertEqual(topic('Earth ocean'),'Earth & environment'); self.assertEqual(topic('Robot engines'),'Ideas & engineering')
if __name__=='__main__': unittest.main()
