"""Read publisher-supplied media metadata; never execute or retain feed HTML."""
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, urlunsplit, parse_qs
import ipaddress, math, re

def public_url(value, base=''):
    try:
        u=urlsplit(urljoin(base,str(value or '').strip()))
        if u.scheme not in ('http','https') or not u.hostname or u.username or u.password:return ''
        host=u.hostname.lower()
        if host=='localhost' or host.endswith(('.local','.internal','.localhost')):return ''
        try:
            if not ipaddress.ip_address(host).is_global:return ''
        except ValueError:pass
        return urlunsplit(('https',u.netloc,u.path,u.query,''))
    except (ValueError,TypeError):return ''

def video(value,base=''):
    value=public_url(value,base)
    if not value:return None
    u=urlsplit(value);host=u.hostname.lower();key=''
    if host in ('youtube.com','www.youtube.com','www.youtube-nocookie.com','m.youtube.com'):
        key=parse_qs(u.query).get('v',[''])[0] if u.path=='/watch' else u.path.split('/')[-1]
        if re.fullmatch(r'[\w-]{11}',key):return {'type':'video','provider':'YouTube','id':key,'url':'https://www.youtube.com/watch?v='+key}
    if host=='youtu.be' and re.fullmatch(r'[\w-]{11}',u.path.strip('/')):
        key=u.path.strip('/');return {'type':'video','provider':'YouTube','id':key,'url':'https://www.youtube.com/watch?v='+key}
    if host in ('vimeo.com','www.vimeo.com','player.vimeo.com') and re.fullmatch(r'\d{4,12}',u.path.split('/')[-1]):
        key=u.path.split('/')[-1];return {'type':'video','provider':'Vimeo','id':key,'url':'https://vimeo.com/'+key}
    if re.search(r'\.(mp4|webm|ogv)$',u.path,re.I):return {'type':'video','provider':'Publisher','src':value,'url':value}
    return None

def dimension(value):
    try:return max(0,min(20000,int(value)))
    except (ValueError,TypeError):return 0

class EmbeddedMedia(HTMLParser):
    def __init__(self,base):super().__init__(convert_charrefs=True);self.base=base;self.images=[];self.videos=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='img':
            src=public_url(a.get('src') or a.get('data-src'),self.base);w=dimension(a.get('width'));h=dimension(a.get('height'))
            if src and not re.search(r'(?:pixel|spacer|tracking|doubleclick|avatar|emoji|favicon)',src,re.I) and not (w and w<40 or h and h<40):
                self.images.append({'type':'image','src':src,'alt':a.get('alt','')[:400],'width':w,'height':h})
        if tag in ('iframe','source','video','a'):
            v=video(a.get('href') if tag=='a' else a.get('src'),self.base)
            if v:self.videos.append(v)

def extract(item,story_url,publisher):
    from feed import plain
    media_ns='http://search.yahoo.com/mrss/'
    images=[];videos=[]
    parents={child:parent for parent in item.iter() for child in parent}
    def scoped(node,name):
        for scope in (node,parents.get(node)):
            if scope is not None:
                match=scope.find('{'+media_ns+'}'+name)
                if match is not None:return plain(''.join(match.itertext()))[:500]
        return ''
    credit='';caption='';license_url=''
    for n in item.iter():
        local=n.tag.rsplit('}',1)[-1]
        if n.tag.startswith('{'+media_ns+'}'):
            if local=='credit':credit=plain(''.join(n.itertext()))[:240]
            if local=='description':caption=plain(''.join(n.itertext()))[:500]
            if local=='license':license_url=public_url(n.get('href') or n.text,story_url)
            if local in ('content','thumbnail'):
                src=public_url(n.get('url'),story_url);kind=n.get('type','')
                if src and (local=='thumbnail' or kind.startswith('image/') or n.get('medium')=='image' or re.search(r'\.(?:jpe?g|png|webp|avif)(?:$|\?)',src,re.I)):
                    images.append({'type':'image','src':src,'width':dimension(n.get('width')),'height':dimension(n.get('height')),'credit':scoped(n,'credit'),'caption':scoped(n,'description')})
                elif src:
                    v=video(src,story_url)
                    if v:videos.append(v)
            if local=='player':
                v=video(n.get('url'),story_url)
                if v:videos.append(v)
        if local in ('enclosure','link') and (local=='enclosure' or n.get('rel')=='enclosure'):
            src=public_url(n.get('url') or n.get('href'),story_url);kind=n.get('type','')
            if src and kind.startswith('image/'):images.append({'type':'image','src':src,'width':0,'height':0})
            elif src:
                v=video(src,story_url)
                if v:videos.append(v)
        if local in ('description','summary','encoded','content') and n.text and '<' in n.text:
            parser=EmbeddedMedia(story_url)
            try:parser.feed(n.text[:200000]);images.extend({**image,'_inlineOrder':order} for order,image in enumerate(parser.images));videos.extend(parser.videos)
            except Exception:pass
        if local=='videoId' and re.fullmatch(r'[\w-]{11}',n.text or ''):
            videos.append({'type':'video','provider':'YouTube','id':n.text,'url':'https://www.youtube.com/watch?v='+n.text})
    # Honor explicit media restrictions instead of stripping their policy metadata.
    if any(n.tag=='{'+media_ns+'}restriction' for n in item.iter()):return []
    unique={}
    for image in sorted(images,key=lambda i:(1,i['_inlineOrder']) if '_inlineOrder' in i else (0,-(i['width'] or 300)*(i['height'] or i['width']*.6 or 180))):
        identity=urlsplit(image['src']).netloc+urlsplit(image['src']).path
        if identity not in unique:
            inline=image.pop('_inlineOrder',None) is not None
            image.update(caption=image.get('alt','') if inline else image.get('caption') or caption or image.get('alt',''),credit=image.get('credit') or credit or 'Image supplied by '+publisher,sourceUrl=story_url,rightsUrl=license_url,origin='publisher feed')
            unique[identity]=image
    photos=list(unique.values())[:3]
    unique_videos={}
    for v in videos:
        v.update(credit=publisher,sourceUrl=story_url,poster=photos[0]['src'] if photos else '',caption=caption,origin='publisher feed')
        unique_videos[v['url']]=v
    return photos+list(unique_videos.values())[:2]

def location(item):
    for n in item.iter():
        if n.tag in ('{http://www.georss.org/georss}point','{http://www.opengis.net/gml}pos'):
            try:
                lat,lon=map(float,(n.text or '').split())
                if math.isfinite(lat) and math.isfinite(lon) and abs(lat)<=90 and abs(lon)<=180:
                    return {'lat':lat,'lon':lon,'basis':'Location supplied in publisher feed','precision':'publisher coordinate'}
            except (ValueError,TypeError):pass
    return None
