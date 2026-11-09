import unittest,urllib.parse
from unittest.mock import patch
import streetview as s
class StreetViewTests(unittest.TestCase):
 def test_missing_key_does_not_request_imagery(self):
  with patch.dict('os.environ',{},clear=True),patch.object(s,'get_json') as get:
   with self.assertRaises(s.Unavailable):s.image_url(41,-87)
   get.assert_not_called()
 def test_invalid_coordinates(self):
  for lat,lon in [(91,0),(0,181),(float('nan'),0),(0,float('inf'))]:
   with self.assertRaises(ValueError):s.coordinates(lat,lon)
 def test_heading_faces_business_from_panorama(self):
  self.assertAlmostEqual(s.bearing((0,0),(1,0)),0);self.assertAlmostEqual(s.bearing((0,0),(0,1)),90);self.assertAlmostEqual(s.bearing((0,0),(-1,0)),180)
 def test_metadata_checked_and_bounded_before_image(self):
  with patch.dict('os.environ',{'GOOGLE_MAPS_API_KEY':'test-key'}),patch.object(s,'get_json',return_value={'status':'OK','pano_id':'example-panorama','location':{'lat':0,'lng':0}}) as get:
   target=s.image_url(0,.0001);parsed=urllib.parse.parse_qs(urllib.parse.urlsplit(target).query)
   self.assertEqual(parsed['heading'],['90.00']);self.assertEqual(parsed['pano'],['example-panorama']);self.assertEqual(parsed['return_error_code'],['true']);self.assertEqual(parsed['size'],['640x400']);self.assertIn('/metadata?',get.call_args.args[0]);self.assertIn('radius=50',get.call_args.args[0])
 def test_missing_panorama_is_explicit(self):
  with patch.dict('os.environ',{'GOOGLE_MAPS_API_KEY':'test-key'}),patch.object(s,'get_json',return_value={'status':'ZERO_RESULTS'}):
   with self.assertRaises(s.Unavailable):s.image_url(41,-87)
 def test_google_image_is_not_put_in_general_provider_cache(self):
  import providers
  providers._cache.clear()
  with patch.dict('os.environ',{'GOOGLE_MAPS_API_KEY':'test-key'}),patch.object(s,'get_json',return_value={'status':'OK','pano_id':'example-panorama'}):s.image_url(41,-87)
  self.assertEqual(providers._cache,{})
if __name__=='__main__':unittest.main()
