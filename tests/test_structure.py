import unittest,re,os,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).parents[1]
class StructureTests(unittest.TestCase):
 def test_all_spaces_share_canvas(self):
  for name in ['news','recipes','places','movies']:
   html=(ROOT/'dist'/f'{name}.html').read_text();self.assertIn('src="canvas.js"',html);self.assertIn('src="spatial.js"',html)
 def test_cards_do_not_use_modal_dialogs(self):
  self.assertNotIn('id="item-dialog"',(ROOT/'space-shell.html').read_text());self.assertNotIn('id="reader-dialog"',(ROOT/'dist/news.html').read_text())
 def test_hub_local_resources_exist(self):
  html=(ROOT/'dist/index.html').read_text()
  for path in re.findall(r'(?:href|src)="([^\"]+)"',html):
   if path.startswith(('#','http','data:')):continue
   self.assertTrue((ROOT/'dist'/path.split('?')[0]).exists(),path)
 def test_space_build_has_no_unreplaced_placeholders(self):
  for name in ['recipes','places','movies']:
   html=(ROOT/'dist'/f'{name}.html').read_text();self.assertNotIn('@SPACE@',html);self.assertNotIn('@LABEL@',html);self.assertIn(f'data-space="{name}"',html)
 def test_standalone_hub_navigation_is_packaged(self):
  html=(ROOT/'Broadsheet-preview.html').read_text();self.assertIn('Broadsheet-recipes-preview.html',html);self.assertIn('window.BROADSHEET_DISCOVERY=',html);self.assertNotRegex(html,r'<script[^>]+src=')
 def test_public_config_never_exports_private_tokens_or_snapshot_keys(self):
  path=ROOT/'dist/config.js';original=path.read_text()
  public='test_browser_key_1234567890';private='private_test_movie_token_do_not_publish'
  try:
   env={**os.environ,'GOOGLE_MAPS_BROWSER_KEY':public,'TMDB_READ_TOKEN':private,'BROADSHEET_API_BASE':'https://test-catalog.example.workers.dev/'}
   subprocess.run([sys.executable,str(ROOT/'build_standalone.py')],env=env,check=True,capture_output=True)
   config=path.read_text();self.assertIn(public,config);self.assertIn('test-catalog.example.workers.dev',config);self.assertNotIn(private,config)
   for name in ['Broadsheet-preview.html','Broadsheet-news-preview.html','Broadsheet-recipes-preview.html','Broadsheet-places-preview.html','Broadsheet-movies-preview.html']:
    html=(ROOT/name).read_text();self.assertNotIn(public,html);self.assertNotIn(private,html)
  finally:path.write_text(original)
if __name__=='__main__':unittest.main()
