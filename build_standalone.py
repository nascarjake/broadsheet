from pathlib import Path
import json,base64,mimetypes
root=Path(__file__).parent;dist=root/'dist'
data=json.loads((dist/'corpus.json').read_text())
for story in data['stories']:
 for block in story.get('blocks',[]):
  if block.get('type')=='image' and block.get('src'):
   path=(dist/block['src']).resolve()
   if path.is_relative_to(dist.resolve()) and path.exists():
    block['src']='data:'+str(mimetypes.guess_type(path.name)[0] or 'image/jpeg')+';base64,'+base64.b64encode(path.read_bytes()).decode()
html=(dist/'index.html').read_text().replace('<link rel="stylesheet" href="style.css">','<style>'+(dist/'style.css').read_text()+'</style>')
datajs='window.BROADSHEET_DATA='+json.dumps(data).replace('</','<\\/')+';'
js=(dist/'app.js').read_text()
html=html.replace('<script type="module" src="app.js"></script>','<script>'+datajs+'</script><script type="module">'+js+'</script>')
(root/'Broadsheet-preview.html').write_text(html)
print('Standalone preview:',len(data['stories']),'full stories;',len(html),'bytes')
