FROM eclipse-temurin:21
WORKDIR /app
COPY target/orcamentos-auth-service-*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
