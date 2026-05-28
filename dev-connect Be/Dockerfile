# syntax=docker/dockerfile:1.6

# ---------- Build stage ----------
FROM maven:3.9-eclipse-temurin-17 AS build
LABEL authors="imshivakumar"

WORKDIR /app

# Cache dependencies first
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

# Build the application
COPY src ./src
RUN mvn -B -q clean package -DskipTests

# ---------- Runtime stage ----------
FROM eclipse-temurin:17-jre-jammy

WORKDIR /app

# Non-root user
RUN groupadd --system app && useradd --system --gid app --create-home app

COPY --from=build /app/target/*.jar app.jar
RUN chown app:app app.jar

USER app

EXPOSE 8080

ENV JAVA_OPTS="-XX:+UseContainerSupport \
    -XX:MaxRAMPercentage=75.0 \
    -XX:InitialRAMPercentage=50.0 \
    -Djava.security.egd=file:/dev/./urandom \
    -Dfile.encoding=UTF-8"

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
