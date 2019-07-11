const { transform } = require('..');
const { stripIndent } = require('common-tags');

QUnit.module('"real life" smoke tests', function() {
  QUnit.module('whitespace and removed hash pairs', function() {
    QUnit.test('Multi-line removed hash pair causes line removal', function(assert) {
      let template = stripIndent`
        {{#foo-bar
          prop="abc"
          anotherProp=123
          yetAnotherProp="xyz"
        }}
          Hello!
        {{/foo-bar}}`;

      let { code } = transform(template, function() {
        return {
          Hash(ast) {
            ast.pairs = ast.pairs.filter(pair => pair.key !== 'anotherProp');
          },
        };
      });

      assert.equal(
        code,
        stripIndent`
          {{#foo-bar
            prop="abc"
            yetAnotherProp="xyz"
          }}
            Hello!
          {{/foo-bar}}`
      );
    });

    QUnit.test('whitespace is preserved when mutating a positional param', function(assert) {
      let template = stripIndent`
        {{some-helper positional}}
        {{#block positional}}
          empty
        {{/block}}
      `;

      let { code } = transform(template, function(env) {
        let { builders: b } = env.syntax;
        return {
          PathExpression(ast) {
            let token = ast.original;

            if (token === 'positional') {
              return b.path(`this.${token}`);
            }
          },
        };
      });
      assert.equal(
        code,
        stripIndent`
          {{some-helper this.positional}}
          {{#block this.positional}}
            empty
          {{/block}}
        `
      );
    });

    QUnit.test('Same-line removed hash pair from middle collapses excess whitespace', function(
      assert
    ) {
      let template = stripIndent`
        {{#hello-world}}
          {{#foo-bar prop="abc"  anotherProp=123  yetAnotherProp="xyz"}}
            Hello!
          {{/foo-bar}}
        {{/hello-world}}`;
      let { code } = transform(template, function() {
        return {
          Hash(ast) {
            ast.pairs = ast.pairs.filter(pair => pair.key !== 'anotherProp');
          },
        };
      });

      assert.equal(
        code,
        stripIndent`
          {{#hello-world}}
            {{#foo-bar prop="abc"  yetAnotherProp="xyz"}}
              Hello!
            {{/foo-bar}}
          {{/hello-world}}`
      );
    });

    QUnit.test('Whitespace properly collapsed when the removed prop is last', function(assert) {
      let template = stripIndent`
        {{#hello-world}}
          {{#foo-bar prop="abc" yetAnotherProp="xyz" anotherProp=123}}
            Hello!
          {{/foo-bar}}
        {{/hello-world}}`;
      let { code } = transform(template, function() {
        return {
          Hash(ast) {
            ast.pairs = ast.pairs.filter(pair => pair.key !== 'anotherProp');
          },
        };
      });
      assert.equal(
        code,
        stripIndent`
          {{#hello-world}}
            {{#foo-bar prop="abc" yetAnotherProp="xyz"}}
              Hello!
            {{/foo-bar}}
          {{/hello-world}}`
      );
    });

    QUnit.test(
      'Whitespace properly collapsed when the removed prop is last and the contents of the tag are spaced',
      function(assert) {
        let template = stripIndent`
          {{#hello-world}}
            {{ foo-bar prop="abc" yetAnotherProp="xyz" anotherProp=123 }}
          {{/hello-world}}`;

        let { code } = transform(template, function() {
          return {
            Hash(ast) {
              ast.pairs = ast.pairs.filter(pair => pair.key !== 'anotherProp');
            },
          };
        });

        assert.equal(
          code,
          stripIndent`
            {{#hello-world}}
              {{ foo-bar prop="abc" yetAnotherProp="xyz" }}
            {{/hello-world}}`
        );
      }
    );

    QUnit.test('Whitespace is left alone for replacements with whitespace on both sides', function(
      assert
    ) {
      let template = stripIndent`
          {{#hello-world foo="foo" bar="bar" as |yieldedProp|}}
            {{yieldedProp.something-something}}
          {{/hello-world}}`;
      let { code } = transform(template, function(env) {
        let { builders: b } = env.syntax;
        return {
          BlockStatement(ast) {
            const hashPairs = ast.hash.pairs;
            hashPairs.push(b.pair('somethingNew', b.string('Hello world!')));
            return ast;
          },
        };
      });
      assert.equal(
        code,
        stripIndent`
            {{#hello-world foo="foo" bar="bar" somethingNew="Hello world!" as |yieldedProp|}}
              {{yieldedProp.something-something}}
            {{/hello-world}}`,
        'Code is updated with new hash, and whitespace on both sides is preserved'
      );
    });
  });

  QUnit.module('multi-line', function(hooks) {
    let i = 0;
    hooks.beforeEach(() => (i = 0));
    function funkyIf(b) {
      return b.block(
        'if',
        [b.sexpr(b.path('a'))],
        null,
        b.program([b.text('\n'), b.text('  '), b.mustache(`${i++}`), b.text('\n'), b.text('\n')])
      );
    }

    QUnit.test('supports multi-line replacements', function(assert) {
      let template = stripIndent`
        {{bar}}

        {{foo}}`;
      let { code } = transform(template, function(env) {
        let { builders: b } = env.syntax;
        return {
          MustacheStatement(node) {
            if (node.loc.source === '(synthetic)') return node;
            return funkyIf(b);
          },
        };
      });

      assert.equal(
        code,
        stripIndent`
          {{#if (a)}}
            {{0}}

          {{/if}}

          {{#if (a)}}
            {{1}}

          {{/if}}
        `
      );
    });

    QUnit.test('collapsing lines (full line replacment)', function(assert) {
      let template = stripIndent`
        here
        is
        some
        multiline
        string
      `;
      let { code } = transform(template, env => {
        let { builders: b } = env.syntax;

        return {
          TextNode() {
            return b.text(`here is a single line string`);
          },
        };
      });

      assert.equal(code, 'here is a single line string');
    });

    QUnit.test('collapsing lines when start line has non-replaced content', function(assert) {
      let template = stripIndent`
        <div
           data-foo={{baz}}></div>here
        is
        some
        multiline
        string`;
      let { code } = transform(template, env => {
        let { builders: b } = env.syntax;

        return {
          TextNode() {
            return b.text(`here is a single line string`);
          },
        };
      });

      assert.equal(code, '<div\n   data-foo={{baz}}></div>here is a single line string');
    });

    QUnit.test('collapsing lines when end line has non-replaced content', function(assert) {
      let template = stripIndent`
        here
        is
        some
        multiline
        string<div
        data-foo={{bar}}></div>`;

      let { code } = transform(template, env => {
        let { builders: b } = env.syntax;

        return {
          TextNode() {
            return b.text(`here is a single line string`);
          },
        };
      });

      assert.equal(code, 'here is a single line string<div\ndata-foo={{bar}}></div>');
    });

    QUnit.test('collapsing lines when start and end lines have non-replaced content', function(
      assert
    ) {
      let template = stripIndent`{{ foo }}
        here
        is
        some
        multiline
        string{{ bar }}`;
      let { code } = transform(template, env => {
        let { builders: b } = env.syntax;

        return {
          TextNode() {
            return b.text(`here is a single line string`);
          },
        };
      });

      assert.equal(code, '{{ foo }}here is a single line string{{ bar }}');
    });

    QUnit.test('Can handle multi-line column expansion', function(assert) {
      let template = `
        <div data-foo="bar"></div>here
        is
        some
        multiline
        string
        `;
      let { code } = transform(template, env => {
        let { builders: b } = env.syntax;

        return {
          TextNode() {
            return b.text(`${Array(10).join('x')}`);
          },
        };
      });

      assert.equal(
        code,
        `${Array(10).join('x')}<div data-foo="${Array(10).join('x')}"></div>${Array(10).join('x')}`
      );
    });

    QUnit.test('supports multi-line replacements with interleaving', function(assert) {
      let template = stripIndent`
        <br>
        {{bar}}
        <div></div>
        {{foo}}
        <hr>`;
      let { code } = transform(template, function(env) {
        let { builders: b } = env.syntax;
        return {
          MustacheStatement(node) {
            if (node.loc.source === '(synthetic)') return node;
            return funkyIf(b);
          },
        };
      });

      assert.equal(
        code,
        stripIndent`
          <br>
          {{#if (a)}}
            {{0}}

          {{/if}}
          <div></div>
          {{#if (a)}}
            {{1}}

          {{/if}}
          <hr>
        `
      );
    });
  });

  QUnit.module('angle-bracket-codemod mockup', function() {
    function isComponent(node) {
      return ['foo-bar'].includes(node.path.original);
    }

    function transformTagName(key) {
      return key
        .split('-')
        .map(text => text[0].toUpperCase() + text.slice(1))
        .join('');
    }

    function codemod(env) {
      let b = env.syntax.builders;

      return {
        MustacheStatement(node) {
          if (!isComponent(node)) {
            return;
          }

          let tagName = transformTagName(node.path.original);

          return b.element(
            { name: tagName, selfClosing: true },
            {
              attrs: node.hash.pairs.map(pair => {
                let value = b.mustache(pair.value);

                if (pair.value.type === 'SubExpression') {
                  pair.value.type = 'MustacheStatement';
                  value = pair.value;
                }

                return b.attr(`@${pair.key}`, value);
              }),
            }
          );
        },
      };
    }

    QUnit.test('works for simple mustache', function(assert) {
      let template = stripIndent`
        {{foo-bar baz=qux}}
      `;

      let { code } = transform(template, codemod);

      assert.equal(code, `<FooBar @baz={{qux}} />`);
    });

    QUnit.test('preserves nested invocation whitespace', function(assert) {
      let template = stripIndent`
        {{foo-bar baz=(something
          goes=here
          and=here
        )}}
      `;

      let { code } = transform(template, codemod);

      assert.equal(
        code,
        stripIndent`
        <FooBar @baz={{something
          goes=here
          and=here
        }} />
      `
      );
    });
  });
});