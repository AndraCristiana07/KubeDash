FROM golang:1.26-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o main main.go

FROM alpine:latest

WORKDIR /root/

# copy only the compiled binary from the builder stage
COPY --from=builder /app/main .

EXPOSE 8080

CMD ["./main"]