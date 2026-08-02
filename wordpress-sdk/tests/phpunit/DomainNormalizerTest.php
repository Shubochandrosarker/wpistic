<?php

namespace Wpistic\Tests;

use PHPUnit\Framework\TestCase;
use Wpistic\DomainNormalizer;

class DomainNormalizerTest extends TestCase {

    public function testNormalizeWithProtocol() {
        $result = DomainNormalizer::normalize('https://example.com');
        $this->assertEquals('example.com', $result);
    }

    public function testNormalizeWithHttp() {
        $result = DomainNormalizer::normalize('http://example.com');
        $this->assertEquals('example.com', $result);
    }

    public function testNormalizeWithWww() {
        $result = DomainNormalizer::normalize('https://www.example.com');
        $this->assertEquals('example.com', $result);
    }

    public function testNormalizeWithPort() {
        $result = DomainNormalizer::normalize('https://example.com:8080');
        $this->assertEquals('example.com', $result);
    }

    public function testNormalizeWithTrailingSlash() {
        $result = DomainNormalizer::normalize('https://example.com/');
        $this->assertEquals('example.com', $result);
    }

    public function testNormalizeWithPath() {
        $result = DomainNormalizer::normalize('https://example.com/blog');
        $this->assertEquals('example.com', $result);
    }

    public function testNormalizeUppercase() {
        $result = DomainNormalizer::normalize('HTTPS://EXAMPLE.COM');
        $this->assertEquals('example.com', $result);
    }

    public function testNormalizeComplex() {
        $result = DomainNormalizer::normalize('HTTPS://WWW.EXAMPLE.COM:8080/BLOG');
        $this->assertEquals('example.com', $result);
    }

    public function testNormalizeWithSpaces() {
        $result = DomainNormalizer::normalize('  https://example.com/  ');
        $this->assertEquals('example.com', $result);
    }
}
