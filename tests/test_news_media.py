import unittest
import feed
from news_media import public_url,video

class NewsMediaTests(unittest.TestCase):
 def parse(self,body):
  return feed.parse(('<rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:georss="http://www.georss.org/georss"><channel><item><title>News</title><link>https://example.com/story</link>'+body+'</item></channel></rss>').encode())[0]
 def test_media_variants_credit_caption_and_largest_image(self):
  s=self.parse('<media:group><media:content url="https://example.com/photo.jpg?w=140" width="140"/><media:content url="https://example.com/photo.jpg?w=700" width="700"/><media:credit>Jane Photographer</media:credit><media:description>Actual scene</media:description></media:group>')
  self.assertEqual(len(s['media']),1);m=s['media'][0];self.assertEqual(m['width'],700);self.assertEqual(m['credit'],'Jane Photographer');self.assertEqual(m['caption'],'Actual scene');self.assertEqual(m['sourceUrl'],s['url'])
 def test_credits_stay_with_their_own_image(self):
  s=self.parse('<media:content url="https://example.com/a.jpg" width="700"><media:credit>Creator A</media:credit></media:content><media:content url="https://example.com/b.jpg" width="600"><media:credit>Creator B</media:credit></media:content>')
  self.assertEqual([m['credit'] for m in s['media']],['Creator A','Creator B'])
 def test_inline_image_order_preserves_story_photo_before_footer(self):
  s=self.parse('<description><![CDATA[<img src="/actual.jpg" width="600" alt="Story scene"><img src="https://example.com/footer.jpg" width="2000"><img src="https://example.com/pixel.gif" width="1">]]></description>')
  self.assertEqual(s['media'][0]['src'],'https://example.com/actual.jpg');self.assertEqual(len(s['media']),2)
 def test_video_and_publisher_coordinate(self):
  s=self.parse('<enclosure url="https://example.com/report.mp4" type="video/mp4"/><georss:point>50.06 19.94</georss:point>')
  self.assertEqual(s['media'][0]['type'],'video');self.assertEqual(s['location']['lat'],50.06)
 def test_inert_video_html_and_safe_embeds(self):
  s=self.parse('<description><![CDATA[<script>alert(1)</script><iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe><iframe src="https://evil.example/execute"></iframe><img src="http://127.0.0.1/private">]]></description>')
  self.assertEqual(len(s['media']),1);self.assertEqual(s['media'][0]['provider'],'YouTube');self.assertNotIn('alert',s['excerpt'])
 def test_restriction_and_invalid_coordinates(self):
  s=self.parse('<media:content url="https://example.com/photo.jpg" type="image/jpeg"/><media:restriction relationship="deny">US</media:restriction><georss:point>nan 999</georss:point>')
  self.assertEqual(s['media'],[]);self.assertIsNone(s['location'])
 def test_private_media_and_arbitrary_frames_are_rejected(self):
  for url in ['javascript:alert(1)','file:///tmp/x','https://name:pass@example.com/image.jpg','http://10.1.1.1/x','http://[::1]/x','http://localhost/x']:self.assertEqual(public_url(url),'')
  self.assertIsNone(video('https://evil.example/embed/test'))
