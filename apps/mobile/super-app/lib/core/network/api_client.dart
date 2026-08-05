import 'package:dio/dio.dart';

/// Shared HTTP client. Base URL comes from `--dart-define=API_BASE_URL=...`
/// at build time; the default targets the local Docker Compose stack.
Dio createApiClient() {
  return Dio(
    BaseOptions(
      baseUrl: const String.fromEnvironment(
        'API_BASE_URL',
        defaultValue: 'http://localhost:3000',
      ),
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
    ),
  );
}
