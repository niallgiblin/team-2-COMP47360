# ===== BUILD STAGE =====
FROM eclipse-temurin:17-jdk-jammy AS builder

WORKDIR /app

COPY mvnw* ./
COPY .mvn/wrapper/ .mvn/wrapper/
COPY pom.xml .
RUN chmod +x mvnw && \
    ./mvnw dependency:go-offline -B

COPY src/ ./src/
RUN ./mvnw clean package -DskipTests

# ===== RUNTIME STAGE =====
FROM eclipse-temurin:17-jre-jammy
WORKDIR /app

COPY --from=builder /app/target/*.jar app.jar

# Security
RUN groupadd -r spring && useradd -r -g spring spring \
    && chown spring:spring /app/app.jar
USER spring

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "--enable-preview", "app.jar"]