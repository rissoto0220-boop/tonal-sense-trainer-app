<?php

declare(strict_types=1);

namespace UecTst\Http;

/**
 * ルーター。パスの {name} を、パラメータとしてハンドラに渡す。
 * ハンドラは (Request $request, array $params): Response。
 */
final class Router
{
    /** @var list<array{method: string, pattern: string, regex: string, names: list<string>, handler: callable}> */
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler): void
    {
        $names = [];
        $regex = '';
        // {name} の部分だけをパラメータにし、それ以外は、文字どおりに照合する。
        foreach (preg_split('/(\{[A-Za-z][A-Za-z0-9]*\})/', $pattern, -1, PREG_SPLIT_DELIM_CAPTURE) as $part) {
            if (preg_match('/^\{([A-Za-z][A-Za-z0-9]*)\}$/', $part, $m)) {
                $names[] = $m[1];
                $regex .= '([^/]+)';
            } else {
                $regex .= preg_quote($part, '#');
            }
        }
        $this->routes[] = [
            'method' => strtoupper($method),
            'pattern' => $pattern,
            'regex' => '#^' . $regex . '$#',
            'names' => $names,
            'handler' => $handler,
        ];
    }

    public function dispatch(Request $request): Response
    {
        $allowed = [];
        foreach ($this->routes as $route) {
            if (!preg_match($route['regex'], $request->path, $m)) {
                continue;
            }
            if ($route['method'] !== $request->method) {
                $allowed[$route['method']] = true;
                continue;
            }
            array_shift($m);
            $params = $route['names'] === [] ? [] : array_combine($route['names'], array_map('strval', $m));
            return ($route['handler'])($request, $params);
        }
        if ($allowed !== []) {
            throw ApiException::methodNotAllowed(implode(', ', array_keys($allowed)));
        }
        throw ApiException::notFound('このパスの API はありません。');
    }
}
