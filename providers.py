"""Fixed-provider adapters for the Broadsheet spaces. No arbitrary URL proxy."""
import json, os, re, time, threading, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from itertools import zip_longest
from datetime import datetime, timezone
from pathlib import Path
from feed import tls_context, plain

ROOT=Path(__file__).parent/'dist'
UA='Broadsheet/0.4 personal browsing prototype (https://github.com/nascarjake/broadsheet)'
MAX_BYTES=5_000_000
_cache={}; _lock=threading.Lock(); _geo_lock=threading.Lock(); _last_geo=0

def get_json(url, headers=None, data=None, timeout=20):
    req=urllib.request.Request(url,data=data,headers={'User-Agent':UA,'Accept':'application/json',**(headers or {})})
    with urllib.request.urlopen(req,timeout=timeout,context=tls_context()) as r: raw=r.read(MAX_BYTES+1)
    if len(raw)>MAX_BYTES:raise ValueError('Provider response exceeds size limit')
    return json.loads(raw)

def cached(key,loader,ttl=3600):
    with _lock: entry=_cache.get(key)
    if entry and time.monotonic()-entry[0]<ttl:return entry[1]
    result=loader()
    with _lock:
        _cache[key]=(time.monotonic(),result)
        if len(_cache)>128:_cache.pop(min(_cache,key=lambda k:_cache[k][0]),None)
    return result

def url(value):
    try:return value if urllib.parse.urlsplit(value or '').scheme in ('http','https') else ''
    except ValueError:return ''

def recipe_item(m):
    ingredients=[{'name':plain(m.get(f'strIngredient{i}')),'amount':plain(m.get(f'strMeasure{i}'))} for i in range(1,21) if plain(m.get(f'strIngredient{i}'))]
    return {'id':'recipe-'+str(m['idMeal']),'kind':'recipes','title':plain(m['strMeal']),
        'image':url(m.get('strMealThumb')),'images':[url(m.get('strMealThumb'))],
        'tags':list(dict.fromkeys([m.get('strCategory',''),m.get('strArea','')]+[x.strip() for x in (m.get('strTags') or '').split(',') if x.strip()])),
        'category':m.get('strCategory') or 'Other','cuisine':m.get('strArea') or 'Unspecified',
        'ingredients':ingredients,'instructions':plain(m.get('strInstructions')),
        'steps':[plain(s) for s in re.split(r'\r?\n+',m.get('strInstructions') or '') if plain(s)],
        'description':', '.join(x['name'] for x in ingredients[:5]),
        'url':url(m.get('strSource')) or 'https://www.themealdb.com/meal/'+str(m['idMeal']),
        'video':url(m.get('strYoutube')),'source':'TheMealDB','sourceUrl':'https://www.themealdb.com/','imageCredit':'TheMealDB contributor photograph','imageLicense':'Provider terms; individual contributor rights retained'}

def recipes(query=''):
    q=plain(query)[:80]
    def load():
        data=get_json('https://www.themealdb.com/api/json/v1/'+urllib.parse.quote(os.environ.get('MEALDB_KEY','1'),safe='')+'/search.php?'+urllib.parse.urlencode({'s':q}))
        return {'items':[recipe_item(m) for m in (data.get('meals') or [])[:40]],'provider':'TheMealDB','collectedAt':datetime.now(timezone.utc).isoformat(),'query':q,'note':'Recipe collection · TheMealDB. Development API.'}
    return cached(('recipes',q),load)

FILM_TAGS={'Castle in the Sky':['Fantasy','Adventure'],'Grave of the Fireflies':['Drama','War'],'My Neighbor Totoro':['Fantasy','Family'],'Kiki\'s Delivery Service':['Fantasy','Family'],'Only Yesterday':['Drama'],'Porco Rosso':['Adventure'],'Pom Poko':['Fantasy'],'Whisper of the Heart':['Romance','Drama'],'Princess Mononoke':['Fantasy','Adventure'],'My Neighbors the Yamadas':['Comedy','Family'],'Spirited Away':['Fantasy','Adventure'],'The Cat Returns':['Fantasy','Family'],'Howl\'s Moving Castle':['Fantasy','Romance'],'Tales from Earthsea':['Fantasy'],'Ponyo':['Fantasy','Family'],'Arrietty':['Fantasy','Family'],'From Up on Poppy Hill':['Romance','Drama'],'The Wind Rises':['Drama'],'The Tale of the Princess Kaguya':['Fantasy','Drama'],'When Marnie Was There':['Drama','Mystery'],'The Red Turtle':['Fantasy','Drama'],'Earwig and the Witch':['Fantasy','Family']}

def film_collection():
    def load():
        data=get_json('https://ghibliapi.vercel.app/films')
        items=[]
        for f in data[:50]:
            title=plain(f['title']);tags=['Animation']+FILM_TAGS.get(title,[])
            items.append({'id':'film-'+f['id'],'kind':'movies','title':title,'originalTitle':plain(f.get('original_title')),
                'image':url(f.get('image')),'images':[url(f.get('image')),url(f.get('movie_banner'))],
                'description':plain(f.get('description')),'year':f.get('release_date'),'runtime':f.get('running_time'),
                'director':plain(f.get('director')),'tags':tags,'category':tags[1] if len(tags)>1 else tags[0],
                'url':'https://en.wikipedia.org/wiki/'+urllib.parse.quote(title.replace(' ','_')),
                'source':'Studio Ghibli API','sourceUrl':'https://ghibliapi.vercel.app/','imageCredit':'Studio Ghibli / original film rights holders; poster hosted by TMDB','imageLicense':'Film artwork copyright retained by its rights holders','catalog':'Ghibli collection'})
        return {'items':items,'provider':'Studio Ghibli API','collectedAt':datetime.now(timezone.utc).isoformat(),'note':'Studio Ghibli collection · not current cinema listings'}
    return cached(('movies','collection'),load,86400)

GENRES={28:'Action',12:'Adventure',16:'Animation',35:'Comedy',80:'Crime',99:'Documentary',18:'Drama',10751:'Family',14:'Fantasy',36:'History',27:'Horror',10402:'Music',9648:'Mystery',10749:'Romance',878:'Science fiction',10770:'TV movie',53:'Thriller',10752:'War',37:'Western'}
def now_playing(query='',region='US'):
    token=os.environ.get('TMDB_READ_TOKEN')
    if not token:raise ValueError('Live cinema listings are not connected. The film collection is still available.')
    region=region.upper()
    if not re.fullmatch('[A-Z]{2}',region):raise ValueError('Choose a two-letter country code.')
    q=plain(query)[:80]
    def load():
        params={'region':region,'language':'en-US','page':1}
        # Search only within the now-playing list, so a search never masquerades as current releases.
        data=get_json('https://api.themoviedb.org/3/movie/now_playing?'+urllib.parse.urlencode(params),headers={'Authorization':'Bearer '+token})
        result=[]
        for f in data.get('results',[]):
            if q and q.casefold() not in (f.get('title','')+' '+f.get('overview','')).casefold():continue
            path=f.get('poster_path');image='https://image.tmdb.org/t/p/w500'+path if path else ''
            tags=[GENRES[g] for g in f.get('genre_ids',[]) if g in GENRES]
            result.append({'id':'tmdb-'+str(f['id']),'kind':'movies','title':plain(f['title']),'image':image,'images':[image],
                'description':plain(f.get('overview')),'year':f.get('release_date','')[:4],'releaseDate':f.get('release_date'),
                'tags':tags,'category':tags[0] if tags else 'Film','source':'TMDB','sourceUrl':'https://www.themoviedb.org/',
                'url':'https://www.themoviedb.org/movie/'+str(f['id']),'imageCredit':'TMDB / original film rights holders','catalog':'Now playing'})
        return {'items':result,'provider':'TMDB','region':region,'collectedAt':datetime.now(timezone.utc).isoformat(),'note':'Now playing · '+region+' · first provider page; not local showtimes'}
    return cached(('now_playing',q,region),load,1800)

def geocode(city):
    city=plain(city)[:100]
    if not city:raise ValueError('Enter a city.')
    def load():
        global _last_geo
        with _geo_lock:
            delay=1.05-(time.monotonic()-_last_geo)
            if delay>0:time.sleep(delay)
            _last_geo=time.monotonic()
            data=get_json(os.environ.get('NOMINATIM_URL','https://nominatim.openstreetmap.org/search')+'?'+urllib.parse.urlencode({'q':city,'format':'jsonv2','limit':1}),timeout=12)
        if not data:raise ValueError('City not found. Try adding a country.')
        return {'lat':float(data[0]['lat']),'lon':float(data[0]['lon']),'name':data[0]['display_name']}
    return cached(('geocode',city.casefold()),load,86400)

def places(city='',lat=None,lon=None):
    city=plain(city)[:100]
    if lat is not None or lon is not None:
        lat=float(lat);lon=float(lon)
        if not (-90<=lat<=90 and -180<=lon<=180):raise ValueError('Invalid map coordinates.')
        lat=round(lat,3);lon=round(lon,3)
    elif not city:raise ValueError('Choose your location or enter a city.')
    def load():
        center={'lat':lat,'lon':lon,'name':'Near your chosen location'} if lat is not None else geocode(city)
        search_lat=center['lat'];search_lon=center['lon']
        query=f'[out:json][timeout:20];(node(around:2500,{search_lat},{search_lon})[amenity~"^(restaurant|cafe|cinema)$"][name];node(around:2500,{search_lat},{search_lon})[tourism~"^(museum|gallery|attraction)$"][name];);out center 60;'
        endpoint=os.environ.get('OVERPASS_URL','https://overpass-api.de/api/interpreter')
        try:data=get_json(endpoint+'?'+urllib.parse.urlencode({'data':query}),timeout=18)
        except Exception:
            # A smaller restaurant/café sample can still make a busy provider useful.
            smaller=f'[out:json][timeout:10];node(around:1500,{search_lat},{search_lon})[amenity~"^(restaurant|cafe)$"][name];out 25;'
            data=get_json(endpoint+'?'+urllib.parse.urlencode({'data':smaller}),timeout=14)
        return places_response(data,city or 'Near you',center)
    return cached(('places',city.casefold(),lat,lon),load,86400)

def places_response(data,city,center):
    items=[]
    for p in data.get('elements',[]):
        t=p.get('tags',{});c=p.get('center',p)
        if not t.get('name') or 'lat' not in c or 'lon' not in c:continue
        kind=t.get('amenity') or t.get('tourism') or 'place';category={'restaurant':'Restaurants','cafe':'Cafés','cinema':'Cinema','museum':'Museums','gallery':'Art & culture','attraction':'Things to do'}.get(kind,'Things to do')
        image=url(t.get('image'));images=[image] if image else []
        address=' '.join(filter(None,[t.get('addr:housenumber'),t.get('addr:street')]))
        cuisine=(t.get('cuisine') or '').replace(';',', ').replace('_',' ')
        items.append({'id':'osm-'+p['type']+'-'+str(p['id']),'kind':'places','title':plain(t['name']),'image':image,'images':images,
            'lat':float(c['lat']),'lon':float(c['lon']),'category':category,'tags':[category]+([cuisine] if cuisine else []),
            'cuisine':cuisine,'address':address,'city':city,'hours':t.get('opening_hours',''),'website':url(t.get('website') or t.get('contact:website')),
            'description':cuisine or category,'url':f"https://www.openstreetmap.org/{p['type']}/{p['id']}",
            'source':'OpenStreetMap','sourceUrl':'https://www.openstreetmap.org/copyright','imageCredit':'Image linked by OpenStreetMap contributor' if image else '',
            'imageLicense':'Unknown; linked external media' if image else '', 'dataLicense':'ODbL 1.0'})
    return {'items':items,'provider':'OpenStreetMap','city':city,'center':center,'collectedAt':datetime.now(timezone.utc).isoformat(),'note':'OpenStreetMap collection · hours and listings may be incomplete'}

def build_snapshot():
    previous=json.loads((ROOT/'discovery.json').read_text()) if (ROOT/'discovery.json').exists() else {}
    output={}
    def recipe_batch():
        queries=['chicken','pasta','salmon','curry','salad','cake','soup','vegetarian']
        batches=list(ThreadPoolExecutor(max_workers=4).map(recipes,queries))
        items=list({s['id']:s for row in zip_longest(*[b['items'][:6] for b in batches]) for s in row if s}.values())
        return {**batches[0],'items':items,'query':'','note':'TheMealDB starter collection · use search to explore more recipes'}
    for name,loader in [('recipes',recipe_batch),('movies',film_collection),('places',lambda:places('Chicago'))]:
        try:output[name]=loader();print(name,len(output[name]['items']))
        except Exception as e:
            print(name,'unavailable:',type(e).__name__,str(e));output[name]=previous.get(name,{'items':[],'note':'Collection unavailable. Search with the local server to try again.'})
    (ROOT/'discovery.json').write_text(json.dumps(output,indent=2,ensure_ascii=False))
if __name__=='__main__':build_snapshot()
