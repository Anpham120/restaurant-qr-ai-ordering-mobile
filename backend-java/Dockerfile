# Multi-stage, mirroring backend/Dockerfile (.NET): a fat SDK image builds, a slim runtime ships.
#
# Build stage pins the same Gradle/JDK pair used throughout development so the image cannot compile
# against a different toolchain than the one every issue was verified on.
FROM gradle:8.10-jdk21 AS build
WORKDIR /src

# Dependency descriptors first: this layer is cached unless the build files themselves change, so
# editing Java sources does not re-resolve the whole dependency graph on every rebuild.
COPY backend-java/build.gradle backend-java/settings.gradle ./
RUN gradle --no-daemon dependencies --configuration runtimeClasspath > /dev/null 2>&1 || true

COPY backend-java/src ./src
RUN gradle --no-daemon bootJar -x test

# JRE, not JDK: the compiler is build-time only, and shipping it would carry javac and the full tool
# chain into production for nothing.
FROM eclipse-temurin:21-jre AS runtime
WORKDIR /app

# curl is here for the same reason as in the .NET image: the compose healthcheck shells out to it.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root, matching the .NET image's `USER app`. Created explicitly because eclipse-temurin has no
# unprivileged user of its own.
RUN groupadd --system spring && useradd --system --gid spring --create-home spring

COPY --from=build --chown=spring:spring /src/build/libs/*.jar /app/app.jar

ENV BACKEND_JAVA_PORT=8081
EXPOSE 8081

USER spring

# `exec` form so the JVM is PID 1 and receives SIGTERM directly — without it the shell swallows the
# signal and compose falls back to SIGKILL after the timeout, cutting off graceful shutdown.
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
