import unittest, json
from unittest.mock import patch
import providers as p
class ProviderTests(unittest.TestCase):
 def setUp(self):p._cache.clear()
 def test_recipe_preserves_details_without_inventing_time(self):
  meal={'idMeal':'1','strMeal':'Test pasta','strCategory':'Vegetarian','strArea':'Italian','strIngredient1':'Tomatoes','strMeasure1':'2','strIngredient2':'Pasta','strMeasure2':'200g','strInstructions':'Boil pasta.\r\nAdd sauce.','strMealThumb':'https://www.themealdb.com/test.jpg','strSource':'javascript:bad()'}
  item=p.recipe_item(meal)
  self.assertEqual(len(item['ingredients']),2);self.assertEqual(len(item['steps']),2);self.assertTrue(item['url'].startswith(('https://','http://')));self.assertNotIn('cookTime',item)
 def test_recipe_search_does_not_become_a_proxy(self):
  with patch.object(p,'get_json',return_value={'meals':None}) as get:
   self.assertEqual(p.recipes('pasta & soup')['items'],[])
   self.assertTrue(get.call_args.args[0].startswith('https://www.themealdb.com/api/json/'));self.assertIn('pasta+%26+soup',get.call_args.args[0])
 def test_place_coordinates_and_source_links(self):
  data={'elements':[{'type':'node','id':12,'lat':41.1,'lon':-87.2,'tags':{'name':'A café','amenity':'cafe','website':'javascript:bad()'}},{'type':'way','id':13,'center':{'lat':41.2,'lon':-87.3},'tags':{'name':'A museum','tourism':'museum'}},{'type':'node','id':14,'tags':{'name':'No geometry'}}]}
  result=p.places_response(data,'Test city',{'lat':41,'lon':-87})
  self.assertEqual(len(result['items']),2);self.assertEqual(result['items'][0]['category'],'Cafés');self.assertEqual(result['items'][1]['category'],'Museums');self.assertEqual(result['items'][0]['website'],'');self.assertEqual(result['items'][0]['url'],'https://www.openstreetmap.org/node/12')
 def test_location_search_is_global_and_rounds_coordinates(self):
  with patch.object(p,'get_json',return_value={'elements':[]}) as get:
   result=p.places(lat=48.856678,lon=2.352221)
   self.assertEqual(result['city'],'Near you');self.assertEqual(result['center']['lat'],48.857);self.assertIn('48.857',get.call_args.args[0]);self.assertIn('2.352',get.call_args.args[0]);self.assertNotIn('Chicago',get.call_args.args[0])
 def test_invalid_location_never_calls_provider(self):
  for lat,lon in [(100,0),(0,181),(float('nan'),0),(float('inf'),0)]:
   with self.assertRaises(ValueError):p.places(lat=lat,lon=lon)
  with self.assertRaises(ValueError):p.places()
 def test_changing_city_uses_geocoded_center(self):
  with patch.object(p,'geocode',return_value={'lat':35.68,'lon':139.69,'name':'Tokyo'}) as geo,patch.object(p,'get_json',return_value={'elements':[]}) as get:
   result=p.places('Tokyo');geo.assert_called_once_with('Tokyo');self.assertEqual(result['city'],'Tokyo');self.assertIn('139.69',get.call_args.args[0])
 def test_now_playing_missing_token_is_explicit(self):
  with patch.dict('os.environ',{},clear=True):
   with self.assertRaisesRegex(ValueError,'not connected'):p.now_playing()
 def test_now_playing_search_stays_within_current_releases(self):
  data={'results':[{'id':1,'title':'New Film','overview':'Example','poster_path':'/film.jpg','genre_ids':[18],'release_date':'2026-11-01'},{'id':2,'title':'Other Film','overview':'Example','genre_ids':[35]}]}
  with patch.dict('os.environ',{'TMDB_READ_TOKEN':'test-provider-token'}),patch.object(p,'get_json',return_value=data) as get:
   result=p.now_playing('New','GB');self.assertEqual(len(result['items']),1);self.assertIn('/movie/now_playing?',get.call_args.args[0]);self.assertIn('region=GB',get.call_args.args[0]);self.assertEqual(result['items'][0]['tags'],['Drama'])
 def test_cache_avoids_repeated_requests(self):
  calls=[]
  self.assertEqual(p.cached('test',lambda:calls.append(1) or 3),3);self.assertEqual(p.cached('test',lambda:calls.append(2) or 4),3);self.assertEqual(calls,[1])
 def test_recipe_results_are_not_cut_off_at_forty(self):
  meals=[{'idMeal':str(n),'strMeal':'Recipe '+str(n)} for n in range(84)]
  with patch.object(p,'get_json',return_value={'meals':meals}):self.assertEqual(len(p.recipes('seafood')['items']),84)
 def test_movie_catalog_search_and_pagination(self):
  data={'results':[{'id':99,'title':'Space film','genre_ids':[878]}],'total_pages':4}
  with patch.dict('os.environ',{'TMDB_READ_TOKEN':'test-provider-token'}),patch.object(p,'get_json',return_value=data) as get:
   result=p.movie_catalog('space','US',2,'search')
   self.assertIn('/search/movie?',get.call_args.args[0]);self.assertIn('query=space',get.call_args.args[0]);self.assertIn('page=2',get.call_args.args[0]);self.assertEqual(result['next'],{'page':3});self.assertEqual(result['catalog'],'search');self.assertTrue(result['live'])
 def test_movie_pages_are_bounded_to_provider_limits(self):
  with patch.dict('os.environ',{'TMDB_READ_TOKEN':'test-provider-token'}),patch.object(p,'get_json') as get:
   for page in [0,501]:
    with self.assertRaises(ValueError):p.movie_catalog(page=page)
   with self.assertRaises(ValueError):p.movie_catalog(mode='unknown')
   get.assert_not_called()
 def test_snapshot_has_attribution_and_real_coordinates(self):
  data=json.loads((p.ROOT/'discovery.json').read_text())
  for kind in ['recipes','movies','places']:
   self.assertGreater(len(data[kind]['items']),10)
   for item in data[kind]['items']:self.assertTrue(item['source']);self.assertTrue(item['url'].startswith(('https://','http://')))
  for item in data['places']['items']:self.assertTrue(-90<=item['lat']<=90);self.assertTrue(-180<=item['lon']<=180)
if __name__=='__main__':unittest.main()
