# Ejemplo de uso de Moleculer y observabilidad de microservicios
# Moleculer + Prometheus (Métricas) + Grafana (Visualización de métricas) + Jaeger (Trazas)

Tenemos 3 microservicios:
* *Api Gateway* que recibirá las peticiones HTTP
* *Orders* con dos endpoints uno para listar los pedidos y otro para añadir uno nuevo
* *Warehouse* que no tienen endpoint y será el microservicio que gestione el stock y comunique los cambios de status en el pedido.

A los que se les va a poder hacer seguimiento haciendo uso de las herramientas Prometheus / Grafana / Jaeger

Para poner todo en funcionamiento:
* Hacer `npm i` en cada uno de los directorios de los microservicios "/app/*"
* En el directorio raiz arrancar todos los servicios usando `docker-compose up`

Se pueden seguir esos 3 microservicios en el panel de control de Moleculer http://localhost:3100

Los paneles de control de los servicios de observabilidad se encuentran en:
* Prometheus: http://localhost:9090
* Grafana: http://localhost:3000 (user:admin / password: pass)
* Jaeger: http://localhost:16686/

Los 3 microservicios exportan sus métricas a Prometheus en las direcciones:
* Api: http://localhost:3130
* Orders: http://localhost:3230
* Warehouse: http://localhost:3330
  
