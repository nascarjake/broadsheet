"""On-demand Google Street View Static API images. Keys and content stay out of snapshots."""
import math,os,urllib.parse,urllib.request
from providers import get_json,UA
from feed import tls_context
class Unavailable(ValueError):pass

def coordinates(lat,lon):
    lat=float(lat);lon=float(lon)
    if not (-90<=lat<=90 and -180<=lon<=180):raise ValueError('Invalid business coordinates.')
    return lat,lon

def bearing(origin,target):
    lat1,lon1=map(math.radians,origin);lat2,lon2=map(math.radians,target)
    delta=lon2-lon1
    return (math.degrees(math.atan2(math.sin(delta)*math.cos(lat2),math.cos(lat1)*math.sin(lat2)-math.sin(lat1)*math.cos(lat2)*math.cos(delta)))+360)%360

def image_url(lat,lon):
    target=coordinates(lat,lon);key=os.environ.get('GOOGLE_MAPS_API_KEY')
    if not key:raise Unavailable('Street View is not connected.')
    params={'location':f'{target[0]:.6f},{target[1]:.6f}','radius':'50','source':'outdoor','key':key}
    metadata=get_json('https://maps.googleapis.com/maps/api/streetview/metadata?'+urllib.parse.urlencode(params),timeout=10)
    if metadata.get('status')!='OK' or not metadata.get('pano_id'):raise Unavailable('Street View is unavailable near this business.')
    camera=metadata.get('location',{})
    origin=coordinates(camera.get('lat',target[0]),camera.get('lng',target[1]))
    params={'pano':metadata['pano_id'],'heading':f'{bearing(origin,target):.2f}','pitch':'0','fov':'80','size':'640x400','return_error_code':'true','key':key}
    return 'https://maps.googleapis.com/maps/api/streetview?'+urllib.parse.urlencode(params)

def fetch_image(lat,lon):
    # Never use the general provider cache for Google imagery or metadata.
    request=urllib.request.Request(image_url(lat,lon),headers={'User-Agent':UA})
    with urllib.request.urlopen(request,timeout=12,context=tls_context()) as response:
        mime=response.headers.get('Content-Type','').split(';')[0]
        data=response.read(2_000_001)
    if mime not in ['image/jpeg','image/png'] or len(data)>2_000_000:raise Unavailable('Street View image unavailable.')
    return data,mime
