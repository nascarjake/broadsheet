import unittest, tempfile, os
from pathlib import Path
from unittest.mock import patch
import server
class LocalSettingsTests(unittest.TestCase):
 def test_local_keys_are_allowlisted_and_never_executed(self):
  with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ,{'TMDB_READ_TOKEN':'existing-token'},clear=True):
   path=Path(directory)/'settings'
   path.write_text('TMDB_READ_TOKEN=other-token\nGOOGLE_MAPS_BROWSER_KEY="public-browser-key"\nUNKNOWN_OPTION=$(touch forbidden)\n')
   server.load_local_settings(path)
   self.assertEqual(os.environ['TMDB_READ_TOKEN'],'existing-token');self.assertNotIn('UNKNOWN_OPTION',os.environ)
   self.assertEqual(server.public_configuration(),{'googleMapsBrowserKey':'public-browser-key'})
   self.assertNotIn('existing-token',str(server.public_configuration()))
