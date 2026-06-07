@echo off
if not exist certs mkdir certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout certs\key.pem -out certs\cert.pem -subj "/CN=localhost/O=KMB/C=RU"
echo Сертификаты созданы в docker\nginx\certs\
