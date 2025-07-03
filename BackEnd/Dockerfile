# ===== BUILD STAGE =====
FROM eclipse-temurin:17-jdk-jammy AS builder

WORKDIR /app

# Layer 1: Cache Maven wrapper and dependencies (faster rebuilds)
COPY mvnw pom.xml ./
COPY .mvn/ .mvn/
# Use BuildKit cache mount for Maven repo
RUN --mount=type=cache,target=/root/.m2 \
    ./mvnw dependency:go-offline -B

# Layer 2: Build application (only re-runs when src changes)
COPY src/ ./src/
RUN --mount=type=cache,target=/root/.m2 \
    ./mvnw clean package -DskipTests \
    -Djava.net.preferIPv4Stack=true \
    -Dmaven.test.skip=true \
    -Dmaven.compile.fork=true

# ===== RUNTIME STAGE =====
FROM eclipse-temurin:17-jre-jammy AS runtime
WORKDIR /app

# Copy built artifact
COPY --from=builder /app/target/*.jar app.jar

# Security setup
RUN groupadd -r spring && \
    useradd -r -g spring spring && \
    chown spring:spring /app/app.jar

USER spring

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "--enable-preview", "app.jar"]