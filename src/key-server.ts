import {createServer} from 'http'
import {config} from './init'
createServer((req,res)=>{
    res.end((req.url??'').slice(1))
}).listen(config.keyServerPort)