# ============================================================
# Stage 1 — Build
# ============================================================
FROM maven:3.9-eclipse-temurin-21 AS build

WORKDIR /build

COPY pom.xml .
COPY src ./src

RUN mvn clean package -DskipTests


# ============================================================
# Stage 2 — Runtime
# ============================================================
FROM eclipse-temurin:21-jre-jammy

WORKDIR /app

RUN useradd --system --create-home --shell /usr/sbin/nologin appuser

COPY --from=build /build/target/orcamentos-auth-service-*.jar app.jar

RUN chown appuser:appuser app.jar

USER appuser

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]