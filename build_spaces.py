from pathlib import Path
root=Path(__file__).parent
html=(root/'space-shell.html').read_text()
for key,label in [('recipes','Recipes'),('places','Places'),('movies','Movies'),('memes','Memes')]:
    (root/'dist'/f'{key}.html').write_text(html.replace('@SPACE@',key).replace('@LABEL@',label))
print('Built recipes, places, movies, and memes with the shared space shell.')
