import unittest,json
from pathlib import Path
R=Path(__file__).parents[1]
class CorpusTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.stories=json.loads((R/'dist/corpus.json').read_text())['stories']
 def test_volume(self):self.assertGreaterEqual(len(self.stories),40)
 def test_unique(self):self.assertEqual(len(self.stories),len({s['url'] for s in self.stories}))
 def test_full_text(self):
  for s in self.stories:self.assertGreaterEqual(sum(len(b.get('text','').split()) for b in s['blocks'] if b['type']=='paragraph'),100)
 def test_every_story_has_images(self):
  for s in self.stories:self.assertTrue(any(b['type']=='image' for b in s['blocks']))
 def test_local_credited_images(self):
  for s in self.stories:
   for b in s['blocks']:
    if b['type']=='image':self.assertTrue((R/'dist'/b['src']).is_file());self.assertTrue(b['credit']);self.assertTrue(b['url'].startswith('https://'))
 def test_standalone(self):
  h=(R/'Broadsheet-news-preview.html').read_text();self.assertIn('window.BROADSHEET_DATA=',h);self.assertIn('data:image/jpeg;base64,',h)
if __name__=='__main__':unittest.main()
