(()=>{
  const originalFetch=window.fetch.bind(window);
  const finite=v=>Number.isFinite(Number(v))?Number(v):null;
  const pair=(lat,lon)=>{lat=finite(lat);lon=finite(lon);return lat!==null&&lon!==null&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180?{lat,lon}:null};
  const geoPair=v=>Array.isArray(v)&&v.length>=2?pair(v[1],v[0]):null;
  const latLonFromString=v=>{if(typeof v!=="string")return null;const m=v.trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);return m?pair(m[1],m[2]):null};
  function normalize(i){
    if(!i||typeof i!=="object")return i;
    if(pair(i.lat,i.lon))return i;
    let p=pair(i.latitude,i.longitude)||pair(i.Latitude,i.Longitude)||latLonFromString(i.Coordinates)||latLonFromString(i.coordinates);
    if(!p&&Array.isArray(i.coordinates))p=geoPair(i.coordinates);
    if(!p&&i.geometry)p=geoPair(i.geometry.coordinates);
    if(!p&&i.location){p=geoPair(i.location.coordinates)||pair(i.location.lat,i.location.lon)||pair(i.location.latitude,i.location.longitude)}
    if(!p&&i.point){p=geoPair(i.point.coordinates)||pair(i.point.lat,i.point.lon)}
    if(!p&&i.geojson?.geometry)p=geoPair(i.geojson.geometry.coordinates);
    if(!p)return i;
    return {...i,lat:p.lat,lon:p.lon};
  }
  window.fetch=async(...args)=>{
    const response=await originalFetch(...args);
    try{
      const url=typeof args[0]==="string"?args[0]:args[0]?.url||"";
      if(!url.includes("/api/incidents"))return response;
      const payload=await response.clone().json();
      if(Array.isArray(payload.incidents)){
        payload.incidents=payload.incidents.map(normalize);
        const withCoords=payload.incidents.filter(i=>pair(i.lat,i.lon)).length;
        window.idmCoordinateStats={total:payload.incidents.length,withCoords};
      }
      return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers:new Headers(response.headers)});
    }catch{return response}
  };
})();
